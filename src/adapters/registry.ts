import type { Adapter } from './types.js';
import { claudeAdapter } from './claude/index.js';

/** All implemented adapters, keyed by id. Codex is added in Phase 4. */
export const adapters: Record<string, Adapter> = {
  claude: claudeAdapter,
};

export type TargetSelector = 'all' | string;

/** Resolve a --target selector to concrete adapters, erroring on unknown ids. */
export function selectAdapters(target: TargetSelector): Adapter[] {
  if (target === 'all') return Object.values(adapters);
  const adapter = adapters[target];
  if (!adapter) {
    const known = Object.keys(adapters).join(', ');
    throw new Error(`Unknown --target "${target}". Available: ${known}, all.`);
  }
  return [adapter];
}
