import type { Hook, HookTrigger } from '../../core/model.js';

/**
 * Claude-specific translation of a neutral hook trigger into a Claude Code hook
 * event + tool matcher + how the wrapper should pull input out of the event JSON.
 * This mapping is Claude's alone — Codex has its own event-map and the two must
 * be validated independently.
 */
export interface ClaudeEventMapping {
  /** Claude hook event name */
  event: 'PreToolUse' | 'PostToolUse' | 'Stop';
  /** tool-name regex; omitted for events (Stop) that take no matcher */
  matcher?: string;
  /** which tool_input field(s) the wrapper extracts, in preference order */
  extractFields: string[];
}

const TABLE: Record<HookTrigger, ClaudeEventMapping> = {
  'before-command': { event: 'PreToolUse', matcher: 'Bash', extractFields: ['command'] },
  'before-file-access': {
    event: 'PreToolUse',
    matcher: 'Read|Edit|Write|MultiEdit|NotebookEdit|Bash',
    extractFields: ['file_path', 'command', 'notebook_path'],
  },
  'after-file-change': {
    event: 'PostToolUse',
    matcher: 'Edit|Write|MultiEdit|NotebookEdit',
    extractFields: [],
  },
  'before-finish': { event: 'Stop', extractFields: [] },
};

export function mapClaudeEvent(hook: Hook): ClaudeEventMapping {
  return TABLE[hook.trigger];
}
