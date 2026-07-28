import { existsSync, statSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadCore } from '../loader/load.js';
import { renderAll } from '../adapters/render-all.js';
import { resolveFilePath } from '../fs/layout.js';
import { loadManifest } from '../fs/manifest.js';
import { fileHash } from '../fs/backup.js';
import { tryParseConfig, type ConfigFormat } from '../fs/config-format.js';
import { coreDir as defaultCoreDir, generatedDir as defaultGeneratedDir, resolveHome } from '../util/paths.js';
import { sha256 } from '../util/hash.js';
import { createLogger, type Logger } from '../util/log.js';

export interface DoctorOptions {
  target: string;
  home?: string;
  coreDir?: string;
  verbose?: boolean;
  json?: boolean;
  logger?: Logger;
}

type Level = 'ok' | 'warn' | 'error';
export interface Check {
  level: Level;
  area: string;
  message: string;
  /** extra context shown only with --verbose (and always present in --json). */
  detail?: string;
}

export interface DoctorReport {
  home: string;
  target: string;
  checks: Check[];
  hasError: boolean;
}

/**
 * Read-only health check of the environment, core/, generated output, and any
 * install found under the given (or real) HOME. Never writes anything. `--verbose`
 * adds per-file detail (expected/actual hash, stale files, sources, backups);
 * `--json` emits the whole model. Compute is separate from formatting so text and
 * JSON describe the exact same checks.
 */
export function computeDoctor(opts: DoctorOptions): DoctorReport {
  const coreDir = opts.coreDir ?? defaultCoreDir();
  const checks: Check[] = [];
  const add = (level: Level, area: string, message: string, detail?: string) =>
    checks.push(detail ? { level, area, message, detail } : { level, area, message });

  // --- Runtime ---
  const major = Number(process.versions.node.split('.')[0]);
  add(major >= 20 ? 'ok' : 'error', 'runtime', `Node ${process.versions.node}${major >= 20 ? '' : ' (need >= 20)'}`);
  for (const cli of ['claude', 'codex']) {
    const found = spawnSync('bash', ['-lc', `command -v ${cli}`], { encoding: 'utf8' }).status === 0;
    add(found ? 'ok' : 'warn', 'runtime', `${cli} CLI ${found ? 'available' : 'not found on PATH'}`);
  }

  // --- Core parse + validation ---
  const { core, diagnostics } = loadCore(coreDir);
  for (const d of diagnostics) add(d.level === 'error' ? 'error' : 'warn', 'core', d.message, d.sourceFile);
  if (diagnostics.every((d) => d.level !== 'error')) add('ok', 'core', 'core parses and validates');

  // --- Hook script permissions ---
  for (const hook of core.hooks) {
    const mode = existsSync(hook.scriptFile) ? statSync(hook.scriptFile).mode : 0;
    const exec = (mode & 0o111) !== 0;
    if (!exec) add('warn', 'hooks', `${path.basename(hook.scriptFile)} is not executable (chmod +x)`, hook.scriptFile);
  }

  // --- MCP env vars referenced by enabled servers ---
  for (const s of core.mcpServers.filter((m) => m.enabled)) {
    for (const ref of Object.values(s.env)) {
      const m = /^\$\{([A-Z0-9_]+)\}$/.exec(ref);
      if (m && !process.env[m[1]!]) add('warn', 'mcp', `env ${m[1]} (for "${s.name}") is not set in the environment`, `referenced by ${s.name}`);
    }
  }

  // --- Per-adapter: compatibility notes + generated drift + install consistency ---
  const home = resolveHome(opts.home);
  const genDir = defaultGeneratedDir();
  const { builds } = renderAll(opts.target, coreDir);

  for (const { adapter, result } of builds) {
    for (const u of result.unsupported) {
      add('warn', `${adapter.id}:compat`, `${u.category}${u.field ? '.' + u.field : ''} — ${u.reason}`, `source: ${u.coreSource}`);
    }

    // generated/ drift
    const toolGen = path.join(genDir, adapter.id);
    if (existsSync(toolGen)) {
      const stale: string[] = [];
      for (const f of result.files) {
        const abs = resolveFilePath(adapter, toolGen, f);
        if (!existsSync(abs) || sha256(readFileSync(abs)) !== sha256(f.content)) stale.push(f.relativePath);
      }
      add(stale.length ? 'warn' : 'ok', `${adapter.id}:generated`,
        stale.length ? `${stale.length} file(s) stale — run \`build\`` : 'generated output up to date',
        stale.length ? `stale: ${stale.join(', ')}` : undefined);
    }

    // install consistency
    const installRoot = adapter.installRoot(home);
    const manifest = loadManifest(installRoot);
    if (!manifest) {
      add('ok', `${adapter.id}:install`, 'not installed (no manifest)');
      continue;
    }
    let missing = 0;
    let modified = 0;
    for (const e of manifest.managed) {
      const abs = path.join(home, e.path);
      const h = fileHash(abs);
      if (h === null) {
        missing++;
        add('error', `${adapter.id}:install`, `managed file missing: ${e.path}`, `backup: ${e.backup ?? 'none'}`);
      } else if (h !== e.renderedHash) {
        modified++;
        add('warn', `${adapter.id}:install`, `managed file modified since install: ${e.path}`, `expected ${e.renderedHash.slice(0, 15)}… actual ${h.slice(0, 15)}…`);
      }
    }
    for (const e of manifest.merges) {
      const abs = path.join(home, e.path);
      if (!existsSync(abs)) continue;
      const parsed = tryParseConfig(readFileSync(abs, 'utf8'), (e.format ?? 'json') as ConfigFormat);
      if (!parsed.ok) add('error', `${adapter.id}:install`, `merge target ${e.path} is malformed ${e.format ?? 'json'}`, parsed.error);
    }
    if (!missing && !modified) add('ok', `${adapter.id}:install`, `install matches manifest (${manifest.managed.length} managed, ${manifest.merges.length} merged)`);
  }

  return { home, target: opts.target, checks, hasError: checks.some((c) => c.level === 'error') };
}

const ICON: Record<Level, string> = { ok: '✓', warn: '⚠', error: '✗' };

export function formatDoctorText(report: DoctorReport, verbose: boolean): string {
  const lines: string[] = [];
  const order: Level[] = ['error', 'warn', 'ok'];
  for (const level of order) {
    for (const c of report.checks.filter((c) => c.level === level)) {
      lines.push(`${ICON[level]} [${c.area}] ${c.message}`);
      if (verbose && c.detail) lines.push(`    ${c.detail}`);
    }
  }
  return lines.join('\n');
}

/** CLI entry: compute once, render text or JSON. Exit code derives from hasError. */
export function runDoctor(opts: DoctorOptions): DoctorReport {
  const log = opts.logger ?? createLogger({ verbose: opts.verbose });
  const report = computeDoctor(opts);
  if (opts.json) log.info(JSON.stringify(report, null, 2));
  else log.info(formatDoctorText(report, !!opts.verbose));
  return report;
}
