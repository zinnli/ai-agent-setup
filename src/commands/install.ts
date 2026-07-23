import { existsSync, readFileSync, rmSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Adapter, GeneratedFile, RenderResult } from '../adapters/types.js';
import { renderAll } from '../adapters/render-all.js';
import { resolveFilePath } from '../fs/layout.js';
import { atomicWrite } from '../fs/atomic.js';
import { fileHash, backupFile, backupSession } from '../fs/backup.js';
import {
  loadManifest,
  saveManifest,
  emptyManifest,
  type Manifest,
  type ManagedEntry,
  type MergeEntry,
} from '../fs/manifest.js';
import { applyMerge, removeMerge } from '../fs/merge.js';
import { tryParseJson } from '../util/json.js';
import { sha256 } from '../util/hash.js';
import { repoRelative, resolveHome } from '../util/paths.js';
import { createLogger, reportDiagnostics, type Logger } from '../util/log.js';
import type { Json } from '../util/objpath.js';

export type ItemStatus =
  | 'ADDED'
  | 'UPDATED'
  | 'UNCHANGED'
  | 'USER_MODIFIED'
  | 'CONFLICT'
  | 'REMOVED'
  | 'ADOPTED';

export interface PlanItem {
  kind: 'managed' | 'merge';
  path: string;
  status: ItemStatus;
  detail?: string;
}

export interface InstallOptions {
  target: string;
  home?: string;
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
  coreDir?: string;
  logger?: Logger;
}

export interface AdapterInstallResult {
  adapter: string;
  items: PlanItem[];
}

/** Run install/update for the selected targets. Returns per-adapter status items. */
export function runInstall(opts: InstallOptions): AdapterInstallResult[] {
  const log = opts.logger ?? createLogger({ verbose: opts.verbose });
  const home = resolveHome(opts.home);

  const { diagnostics, builds } = renderAll(opts.target, opts.coreDir);
  if (reportDiagnostics(diagnostics, log) && !opts.force) {
    throw new Error('core validation failed. Fix the errors above or pass --force.');
  }

  const results: AdapterInstallResult[] = [];
  for (const { adapter, result } of builds) {
    const items = installAdapter(adapter, result, home, opts, log);
    results.push({ adapter: adapter.id, items });
    summarize(adapter.id, items, opts, log);
  }
  return results;
}

/**
 * Reconcile one adapter's rendered output against the current install:
 * add new files, update ours, preserve user-modified ones, back up displaced
 * files, structurally merge config, and remove orphans no longer produced.
 * When opts.dryRun is set, nothing is written (this powers `diff`).
 */
export function installAdapter(
  adapter: Adapter,
  result: RenderResult,
  home: string,
  opts: InstallOptions,
  log: Logger,
): PlanItem[] {
  const installRoot = adapter.installRoot(home);
  const prev = loadManifest(installRoot) ?? emptyManifest(adapter.id);
  const session = backupSession();
  const dry = !!opts.dryRun;
  const force = !!opts.force;

  const items: PlanItem[] = [];
  const managed: ManagedEntry[] = [];
  const merges: MergeEntry[] = [];

  const managedFiles = result.files.filter((f) => f.managed);
  const mergeFiles = result.files.filter((f) => !f.managed);

  const newManagedPaths = new Set<string>();
  const newMergePaths = new Set<string>();

  // --- Managed (full-ownership) files ---
  for (const file of managedFiles) {
    const abs = resolveFilePath(adapter, home, file);
    const homeRel = path.relative(home, abs);
    newManagedPaths.add(homeRel);
    const newHash = sha256(file.content);
    const prevEntry = prev.managed.find((e) => e.path === homeRel);
    const diskHash = fileHash(abs);
    const sourceFiles = file.sourceFiles.map((s) => repoRelative(s));
    let backup: string | null = prevEntry?.backup ?? null;
    let status: ItemStatus;

    if (diskHash === null) {
      status = 'ADDED';
      if (!dry) writeManaged(abs, file);
    } else if (diskHash === newHash) {
      status = prevEntry ? 'UNCHANGED' : 'ADOPTED';
    } else if (prevEntry && diskHash === prevEntry.renderedHash) {
      status = 'UPDATED';
      if (!dry) writeManaged(abs, file);
    } else if (prevEntry) {
      // Our file, but the user edited it since install.
      if (force) {
        status = 'UPDATED';
        if (!dry) {
          backupFile(home, installRoot, abs, session); // safety copy of user's version
          writeManaged(abs, file);
        }
      } else {
        status = 'USER_MODIFIED';
        log.warn(`preserved user-modified ${homeRel} (use --force to overwrite)`);
      }
    } else {
      // A pre-existing unmanaged file we do not own: back it up, then take over.
      status = 'ADDED';
      if (!dry) {
        backup = backupFile(home, installRoot, abs, session);
        writeManaged(abs, file);
      }
      log.debug(`backed up pre-existing ${homeRel}`);
    }

    managed.push({ path: homeRel, renderedHash: newHash, backup, sourceFiles });
    items.push({ kind: 'managed', path: homeRel, status });
  }

  // --- Merge (structural) files ---
  for (const file of mergeFiles) {
    const abs = resolveFilePath(adapter, home, file);
    const homeRel = path.relative(home, abs);
    newMergePaths.add(homeRel);
    const prevEntry = prev.merges.find((e) => e.path === homeRel);
    const sourceFiles = file.sourceFiles.map((s) => repoRelative(s));

    const existingText = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
    let existing: Json = {};
    if (existingText !== null) {
      const parsed = tryParseJson(existingText);
      if (!parsed.ok) {
        log.error(`skipping merge into ${homeRel}: malformed JSON (${parsed.error})`);
        items.push({ kind: 'merge', path: homeRel, status: 'CONFLICT', detail: 'malformed target' });
        // keep any prior manifest entry so we don't lose tracking
        if (prevEntry) merges.push(prevEntry);
        continue;
      }
      existing = (parsed.value ?? {}) as Json;
    }

    const applied = applyMerge(existing, file, prevEntry, force);
    let backup: string | null = prevEntry?.backup ?? null;
    let status: ItemStatus;

    if (applied.conflicts.length > 0 && !force) {
      status = 'CONFLICT';
      for (const c of applied.conflicts) log.warn(`conflict at ${homeRel}:${c.path} — ${c.reason} (use --force)`);
    } else if (!applied.changed) {
      status = 'UNCHANGED';
    } else {
      status = existingText === null ? 'ADDED' : 'UPDATED';
    }

    if (!dry && applied.changed) {
      if (existingText !== null && !backup) backup = backupFile(home, installRoot, abs, session);
      atomicWrite(abs, JSON.stringify(applied.merged, null, 2) + '\n', 0o644);
    }

    const entry: MergeEntry = {
      path: homeRel,
      strategy: file.mergeStrategy ?? 'replace-keys',
      managedPaths: file.managedPaths ?? [],
      backup,
      sourceFiles,
    };
    if (applied.installedHashes) entry.installedHashes = applied.installedHashes;
    if (applied.managedItems) entry.managedItems = applied.managedItems;
    merges.push(entry);
    items.push({ kind: 'merge', path: homeRel, status });
  }

  // --- Orphans: previously managed, no longer produced ---
  for (const e of prev.managed) {
    if (newManagedPaths.has(e.path)) continue;
    items.push({ kind: 'managed', path: e.path, status: 'REMOVED' });
    if (!dry) restoreOrRemoveManaged(home, e);
  }
  for (const e of prev.merges) {
    if (newMergePaths.has(e.path)) continue;
    items.push({ kind: 'merge', path: e.path, status: 'REMOVED' });
    if (!dry) removeMergeEntry(home, e, force, log);
  }

  if (!dry) {
    const manifest: Manifest = {
      tool: adapter.id,
      version: prev.version,
      installedAt: prev.installedAt || new Date().toISOString(),
      managed,
      merges,
    };
    saveManifest(installRoot, manifest);
  }

  return items;
}

function writeManaged(abs: string, file: GeneratedFile): void {
  atomicWrite(abs, file.content, file.mode ?? 0o644);
}

/** Restore a managed file's original backup if we displaced one, else delete it. */
export function restoreOrRemoveManaged(home: string, entry: ManagedEntry): void {
  const abs = path.join(home, entry.path);
  if (entry.backup) {
    const backupAbs = path.join(home, entry.backup);
    if (existsSync(backupAbs)) {
      mkdirSync(path.dirname(abs), { recursive: true });
      renameSync(backupAbs, abs);
      return;
    }
  }
  if (existsSync(abs)) rmSync(abs, { force: true });
}

/** Strip our managed content from a merge target (used by uninstall + orphan cleanup). */
export function removeMergeEntry(home: string, entry: MergeEntry, force: boolean, log: Logger): void {
  const abs = path.join(home, entry.path);
  if (!existsSync(abs)) return;
  const parsed = tryParseJson(readFileSync(abs, 'utf8'));
  if (!parsed.ok) {
    log.error(`cannot clean ${entry.path}: malformed JSON — left untouched`);
    return;
  }
  const { merged, preserved } = removeMerge((parsed.value ?? {}) as Json, entry, force);
  for (const p of preserved) log.warn(`preserved user-modified ${entry.path}:${p} (use --force to remove)`);

  // If nothing remains and we created the file (no pre-existing backup), remove it
  // entirely rather than leaving an empty {} behind. Otherwise write the residue,
  // which still holds the user's own keys.
  if (Object.keys(merged).length === 0 && !entry.backup) {
    rmSync(abs, { force: true });
    return;
  }
  atomicWrite(abs, JSON.stringify(merged, null, 2) + '\n', 0o644);
}

function summarize(adapter: string, items: PlanItem[], opts: InstallOptions, log: Logger): void {
  const counts = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .map(([k, v]) => `${v} ${k.toLowerCase()}`)
    .join(', ');
  log.info(`${adapter}${opts.dryRun ? ' (dry-run)' : ''}: ${summary || 'nothing to do'}`);
}
