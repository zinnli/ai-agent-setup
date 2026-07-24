import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { renderAll } from '../adapters/render-all.js';
import { installAdapter, type PlanItem, type ItemStatus } from './install.js';
import { resolveFilePath } from '../fs/layout.js';
import { loadManifest } from '../fs/manifest.js';
import { fileHash } from '../fs/backup.js';
import { sha256 } from '../util/hash.js';
import { generatedDir as defaultGeneratedDir, resolveHome } from '../util/paths.js';
import { silentLogger, createLogger, type Logger } from '../util/log.js';

export interface StatusOptions {
  target: string;
  home?: string;
  coreDir?: string;
  json?: boolean;
  verbose?: boolean;
  logger?: Logger;
}

export interface AdapterStatus {
  adapter: string;
  installRoot: string;
  installed: boolean;
  installedAt: string | null;
  /** files fully owned + structural merges recorded in the manifest */
  managedInstalled: number;
  mergesInstalled: number;
  /** managed files recorded in the manifest but gone from disk */
  missing: number;
  /** managed files edited by the user since install */
  modified: number;
  /** structural-merge conflicts a fresh update would hit */
  conflicts: number;
  /** what `update` would change vs the current install (drift signal) */
  pendingChanges: number;
  planCounts: Partial<Record<ItemStatus, number>>;
  /** core render vs generated/<tool> on disk (stale generated output) */
  generatedDrift: number;
}

export interface StatusReport {
  home: string;
  target: string;
  core: { errors: number; warnings: number };
  adapters: AdapterStatus[];
}

/** Compute the status model. Pure read-only: uses a dry-run reconcile + manifest. */
export function computeStatus(opts: StatusOptions): StatusReport {
  const home = resolveHome(opts.home);
  const genDir = defaultGeneratedDir();
  const { diagnostics, builds } = renderAll(opts.target, opts.coreDir);

  const adapters: AdapterStatus[] = [];
  for (const { adapter, result } of builds) {
    const installRoot = adapter.installRoot(home);
    const manifest = loadManifest(installRoot);

    // Dry-run reconcile of freshly-rendered core against the current install.
    const items = installAdapter(adapter, result, home, { target: opts.target, dryRun: true }, silentLogger);
    const planCounts = tally(items);

    let missing = 0;
    let modified = 0;
    if (manifest) {
      for (const e of manifest.managed) {
        const h = fileHash(path.join(home, e.path));
        if (h === null) missing++;
        else if (h !== e.renderedHash) modified++;
      }
    }

    let generatedDrift = 0;
    const toolGen = path.join(genDir, adapter.id);
    if (existsSync(toolGen)) {
      for (const f of result.files) {
        const abs = resolveFilePath(adapter, toolGen, f);
        if (!existsSync(abs) || sha256(readFileSync(abs)) !== sha256(f.content)) generatedDrift++;
      }
    }

    const conflicts = planCounts.CONFLICT ?? 0;
    const pendingChanges =
      (planCounts.ADDED ?? 0) + (planCounts.UPDATED ?? 0) + (planCounts.REMOVED ?? 0) + conflicts;

    adapters.push({
      adapter: adapter.id,
      installRoot,
      installed: manifest !== null,
      installedAt: manifest?.installedAt ?? null,
      managedInstalled: manifest?.managed.length ?? 0,
      mergesInstalled: manifest?.merges.length ?? 0,
      missing,
      modified,
      conflicts,
      pendingChanges,
      planCounts,
      generatedDrift,
    });
  }

  return {
    home,
    target: opts.target,
    core: {
      errors: diagnostics.filter((d) => d.level === 'error').length,
      warnings: diagnostics.filter((d) => d.level === 'warn').length,
    },
    adapters,
  };
}

function tally(items: PlanItem[]): Partial<Record<ItemStatus, number>> {
  const out: Partial<Record<ItemStatus, number>> = {};
  for (const i of items) out[i.status] = (out[i.status] ?? 0) + 1;
  return out;
}

export function formatStatusText(r: StatusReport): string {
  const lines: string[] = [];
  lines.push(`target: ${r.target}   home: ${r.home}`);
  lines.push(`core:   ${r.core.errors} error(s), ${r.core.warnings} warning(s)`);
  for (const a of r.adapters) {
    lines.push('');
    lines.push(`[${a.adapter}] ${a.installed ? 'installed' : 'not installed'}${a.installedAt ? ` (since ${a.installedAt})` : ''}`);
    lines.push(`  install root:      ${a.installRoot}`);
    lines.push(`  managed files:     ${a.managedInstalled}`);
    lines.push(`  merged configs:    ${a.mergesInstalled}`);
    lines.push(`  missing:           ${a.missing}`);
    lines.push(`  user-modified:     ${a.modified}`);
    lines.push(`  conflicts:         ${a.conflicts}`);
    lines.push(`  generated drift:   ${a.generatedDrift}${a.generatedDrift ? '  (run `build`)' : ''}`);
    lines.push(`  pending vs install:${a.pendingChanges}${a.pendingChanges ? '  (run `update`)' : ''}`);
  }
  return lines.join('\n');
}

/** CLI entry: compute the model once, render as text or JSON. */
export function runStatus(opts: StatusOptions): StatusReport {
  const log = opts.logger ?? createLogger({ verbose: opts.verbose });
  const report = computeStatus(opts);
  if (opts.json) log.info(JSON.stringify(report, null, 2));
  else log.info(formatStatusText(report));
  return report;
}
