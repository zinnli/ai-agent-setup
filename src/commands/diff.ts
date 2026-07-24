import { renderAll } from '../adapters/render-all.js';
import { installAdapter, type PlanItem } from './install.js';
import { resolveHome } from '../util/paths.js';
import { createLogger, reportDiagnostics, silentLogger, type Logger } from '../util/log.js';

export interface DiffOptions {
  target: string;
  home?: string;
  verbose?: boolean;
  json?: boolean;
  coreDir?: string;
  logger?: Logger;
}

const ICON: Record<string, string> = {
  ADDED: '+',
  UPDATED: '~',
  UNCHANGED: '=',
  USER_MODIFIED: '!',
  CONFLICT: '✗',
  REMOVED: '-',
  ADOPTED: '≈',
};

/**
 * Show, per target, what installing the current core would do to the current
 * (temp or real) HOME — without writing anything. Reuses the install planner in
 * dry-run mode so statuses exactly match a real install.
 */
export function runDiff(opts: DiffOptions): { adapter: string; items: PlanItem[] }[] {
  const log = opts.logger ?? createLogger({ verbose: opts.verbose });
  const home = resolveHome(opts.home);

  const planLogger = opts.json ? silentLogger : log;
  const { diagnostics, builds } = renderAll(opts.target, opts.coreDir);
  if (!opts.json) reportDiagnostics(diagnostics, log);

  const results: { adapter: string; items: PlanItem[] }[] = [];
  for (const { adapter, result } of builds) {
    const items = installAdapter(adapter, result, home, { target: opts.target, dryRun: true }, planLogger);
    if (!opts.json) {
      log.info(`\n${adapter.id}:`);
      for (const item of items) {
        log.info(`  ${ICON[item.status] ?? '?'} ${item.status.padEnd(13)} ${item.path}${item.detail ? ` (${item.detail})` : ''}`);
      }
    }
    results.push({ adapter: adapter.id, items });
  }
  if (opts.json) log.info(JSON.stringify({ home, target: opts.target, adapters: results }, null, 2));
  return results;
}
