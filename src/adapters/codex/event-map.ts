import type { Hook, HookTrigger } from '../../core/model.js';

/**
 * Codex-specific mapping of a neutral hook trigger to a Codex hook event. Verified
 * against the official Codex hooks schema (events PreToolUse/PostToolUse/Stop;
 * exit code 2 blocks a PreToolUse). This mapping is validated independently of
 * Claude's — do not assume the two are interchangeable.
 *
 * `matcher` is intentionally OMITTED: the official docs do not enumerate Codex's
 * exact tool names, so narrowing by matcher would be an unverified assumption.
 * Instead each hook fires on all occurrences of its event and the wrapper decides
 * based on the extracted content (a missing field simply yields "allow"). This
 * choice is recorded per-hook in COMPATIBILITY.md.
 */
export interface CodexEventMapping {
  event: 'PreToolUse' | 'PostToolUse' | 'Stop';
  matcher?: string;
  extractFields: string[];
}

const TABLE: Record<HookTrigger, CodexEventMapping> = {
  'before-command': { event: 'PreToolUse', extractFields: ['command'] },
  'before-file-access': { event: 'PreToolUse', extractFields: ['file_path', 'command', 'notebook_path'] },
  'after-file-change': { event: 'PostToolUse', extractFields: [] },
  'before-finish': { event: 'Stop', extractFields: [] },
};

export function mapCodexEvent(hook: Hook): CodexEventMapping {
  return TABLE[hook.trigger];
}
