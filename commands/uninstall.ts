import { existsSync, rmSync } from 'node:fs';
import { selectAdapters } from '../adapters/registry.js';
import { loadManifest, manifestPath } from '../fs/manifest.js';
import { restoreOrRemoveManaged, removeMergeEntry, type PlanItem } from './install.js';
import { resolveHome } from '../util/paths.js';
import { createLogger, type Logger } from '../util/log.js';

export interface UninstallOptions {
  target: string;
  home?: string;
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
  logger?: Logger;
}

/**
 * Remove everything ai-agent-setup installed: restore displaced files, strip our
 * managed merge entries (preserving user changes unless --force), and delete the
 * manifest. Unrelated user settings are never touched.
 */
export function runUninstall(opts: UninstallOptions): { adapter: string; items: PlanItem[] }[] {
  const log = opts.logger ?? createLogger({ verbose: opts.verbose });
  const home = resolveHome(opts.home);
  const dry = !!opts.dryRun;
  const results: { adapter: string; items: PlanItem[] }[] = [];

  for (const adapter of selectAdapters(opts.target)) {
    const installRoot = adapter.installRoot(home);
    const manifest = loadManifest(installRoot);
    const items: PlanItem[] = [];
    if (!manifest) {
      log.info(`${adapter.id}: nothing installed`);
      results.push({ adapter: adapter.id, items });
      continue;
    }

    for (const e of manifest.managed) {
      const restored = e.backup ? 'RESTORED' : 'REMOVED';
      items.push({ kind: 'managed', path: e.path, status: 'REMOVED', detail: restored });
      if (!dry) restoreOrRemoveManaged(home, e);
    }
    for (const e of manifest.merges) {
      items.push({ kind: 'merge', path: e.path, status: 'REMOVED' });
      if (!dry) removeMergeEntry(home, e, !!opts.force, log);
    }

    if (!dry) {
      const mp = manifestPath(installRoot);
      if (existsSync(mp)) rmSync(mp, { force: true });
    }

    log.info(`${adapter.id}${dry ? ' (dry-run)' : ''}: removed ${items.length} item(s)`);
    results.push({ adapter: adapter.id, items });
  }
  return results;
}
