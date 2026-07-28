import type { Hook, HookTrigger } from '../../loader/model.js';

/**
 * Codex-specific mapping of a neutral hook trigger to a Codex hook event +
 * matcher. Verified against codex-cli 0.142.5 + the official hooks reference
 * (learn.chatgpt.com/docs/hooks):
 *
 * - Events: PreToolUse, PostToolUse, Stop (among others).
 * - `matcher` is a regex over the TOOL NAME. Shell = `Bash`; file edits =
 *   `apply_patch` (also matchable as `Edit`/`Write`). Stop ignores `matcher`.
 * - Every command hook receives one JSON object on stdin. For PreToolUse/
 *   PostToolUse the shell command (Bash) AND the patch text (apply_patch) both
 *   live in `tool_input.command`; there is no separate `file_path` field.
 *
 * This mapping is validated independently of Claude's — do not assume the two
 * are interchangeable.
 */
export interface CodexEventMapping {
  event: 'PreToolUse' | 'PostToolUse' | 'Stop';
  /** regex over tool name; omitted where the event ignores matchers (Stop). */
  matcher?: string;
  /** tool_input.* fields the wrapper extracts, in priority order. */
  extractFields: string[];
}

const FILE_TOOLS = 'apply_patch|Edit|Write';

const TABLE: Record<HookTrigger, CodexEventMapping> = {
  // Shell commands match as `Bash` (covers unified exec too).
  'before-command': { event: 'PreToolUse', matcher: 'Bash', extractFields: ['command'] },
  // Secret guard must see both shell reads (cat .env) and edits. apply_patch/Edit/
  // Write deliver the patch text in tool_input.command, so `command` covers both.
  'before-file-access': { event: 'PreToolUse', matcher: `Bash|${FILE_TOOLS}`, extractFields: ['command'] },
  // Post-edit formatter operates on git-changed files, so it needs no field.
  'after-file-change': { event: 'PostToolUse', matcher: FILE_TOOLS, extractFields: [] },
  // Stop ignores matcher; hook works from workspace/git state.
  'before-finish': { event: 'Stop', extractFields: [] },
};

export function mapCodexEvent(hook: Hook): CodexEventMapping {
  return TABLE[hook.trigger];
}
