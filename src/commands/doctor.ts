import { existsSync, statSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadCore } from '../core/load.js';
import { renderAll } from '../adapters/render-all.js';
import { selectAdapters } from '../adapters/registry.js';
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
  logger?: Logger;
}

type Level = 'ok' | 'warn' | 'error';
interface Check {
  level: Level;
  area: string;
  message: string;
}

/**
 * Read-only health check of the environment, core/, generated output, and any
 * install found under the given (or real) HOME. Never writes anything.
 * Returns the checks; the process exit code is derived from whether any errored.
 */
export function runDoctor(opts: DoctorOptions): { checks: Check[]; hasError: boolean } {
  const log = opts.logger ?? createLogger({ verbose: opts.verbose });
  const coreDir = opts.coreDir ?? defaultCoreDir();
  const checks: Check[] = [];
  const add = (level: Level, area: string, message: string) => checks.push({ level, area, message });

  // --- Runtime ---
  const major = Number(process.versions.node.split('.')[0]);
  add(major >= 20 ? 'ok' : 'error', 'runtime', `Node ${process.versions.node}${major >= 20 ? '' : ' (need >= 20)'}`);
  for (const cli of ['claude', 'codex']) {
    const found = spawnSync('bash', ['-lc', `command -v ${cli}`], { encoding: 'utf8' }).status === 0;
    add(found ? 'ok' : 'warn', 'runtime', `${cli} CLI ${found ? 'available' : 'not found on PATH'}`);
  }

  // --- Core parse + validation ---
  const { core, diagnostics } = loadCore(coreDir);
  for (const d of diagnostics) add(d.level === 'error' ? 'error' : 'warn', 'core', d.message);
  if (diagnostics.every((d) => d.level !== 'error')) add('ok', 'core', 'core parses and validates');

  // --- Hook script permissions ---
  for (const hook of core.hooks) {
    const mode = existsSync(hook.scriptFile) ? statSync(hook.scriptFile).mode : 0;
    const exec = (mode & 0o111) !== 0;
    if (!exec) add('warn', 'hooks', `${path.basename(hook.scriptFile)} is not executable (chmod +x)`);
  }

  // --- MCP env vars referenced by enabled servers ---
  for (const s of core.mcpServers.filter((m) => m.enabled)) {
    for (const ref of Object.values(s.env)) {
      const m = /^\$\{([A-Z0-9_]+)\}$/.exec(ref);
      if (m && !process.env[m[1]!]) add('warn', 'mcp', `env ${m[1]} (for "${s.name}") is not set in the environment`);
    }
  }

  // --- Per-adapter: compatibility notes + generated drift + install consistency ---
  const home = resolveHome(opts.home);
  const genDir = defaultGeneratedDir();
  const { builds } = renderAll(opts.target, coreDir);

  for (const { adapter, result } of builds) {
    for (const u of result.unsupported) {
      add('warn', `${adapter.id}:compat`, `${u.category}${u.field ? '.' + u.field : ''} — ${u.reason}`);
    }

    // generated/ drift
    const toolGen = path.join(genDir, adapter.id);
    if (existsSync(toolGen)) {
      let drift = 0;
      for (const f of result.files) {
        const abs = resolveFilePath(adapter, toolGen, f);
        if (!existsSync(abs) || sha256(readFileSync(abs)) !== sha256(f.content)) drift++;
      }
      add(drift ? 'warn' : 'ok', `${adapter.id}:generated`, drift ? `${drift} file(s) stale — run \`build\`` : 'generated output up to date');
    }

    // install consistency
    const manifest = loadManifest(adapter.installRoot(home));
    if (!manifest) {
      add('ok', `${adapter.id}:install`, 'not installed (no manifest)');
      continue;
    }
    let missing = 0;
    let modified = 0;
    for (const e of manifest.managed) {
      const abs = path.join(home, e.path);
      const h = fileHash(abs);
      if (h === null) missing++;
      else if (h !== e.renderedHash) modified++;
    }
    if (missing) add('error', `${adapter.id}:install`, `${missing} managed file(s) missing from the install`);
    if (modified) add('warn', `${adapter.id}:install`, `${modified} managed file(s) modified since install`);
    for (const e of manifest.merges) {
      const abs = path.join(home, e.path);
      if (!existsSync(abs)) continue;
      const parsed = tryParseConfig(readFileSync(abs, 'utf8'), (e.format ?? 'json') as ConfigFormat);
      if (!parsed.ok) add('error', `${adapter.id}:install`, `merge target ${e.path} is malformed ${e.format ?? 'json'}`);
    }
    if (!missing && !modified) add('ok', `${adapter.id}:install`, 'install matches manifest');
  }

  // --- Report ---
  const order: Level[] = ['error', 'warn', 'ok'];
  const icon = { ok: '✓', warn: '⚠', error: '✗' };
  for (const level of order) {
    for (const c of checks.filter((c) => c.level === level)) {
      // icons are included here, so print plainly to avoid the logger's own prefix
      log.info(`${icon[level]} [${c.area}] ${c.message}`);
    }
  }
  const hasError = checks.some((c) => c.level === 'error');
  return { checks, hasError };
}
