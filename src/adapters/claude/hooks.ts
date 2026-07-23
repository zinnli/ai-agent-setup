import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { CoreModel } from '../../core/model.js';
import type { GeneratedFile } from '../types.js';
import { managedHeader } from '../shared/managed-header.js';
import { mapClaudeEvent } from './event-map.js';
import { renderClaudeHookWrapper } from './hook-wrapper.js';

interface SettingsHookEntry {
  matcher?: string;
  hooks: { type: 'command'; command: string }[];
}

/**
 * Render Claude hooks: copy each neutral script, emit its wrapper shim, and build
 * the settings.json hook-wiring fragment (a structural-merge target, managed:false).
 * The command paths use $HOME so a global install resolves regardless of build-time HOME.
 */
export function renderHooks(core: CoreModel): GeneratedFile[] {
  if (core.hooks.length === 0) return [];

  const files: GeneratedFile[] = [];
  const events: Record<string, SettingsHookEntry[]> = {};
  const sources: string[] = [];
  const manifestFile = path.join(path.dirname(core.hooks[0]!.scriptFile), 'manifest.yaml');

  for (const hook of core.hooks) {
    const mapping = mapClaudeEvent(hook);

    // 1. Neutral script, copied verbatim with a banner injected after the shebang.
    files.push({
      relativePath: `hooks/${hook.id}.sh`,
      content: injectBanner(readFileSync(hook.scriptFile, 'utf8'), [hook.scriptFile]),
      sourceFiles: [hook.scriptFile],
      mode: 0o755,
      managed: true,
    });

    // 2. Wrapper shim (JSON stdin -> neutral script -> exit-2 on block).
    files.push({
      relativePath: `hooks/${hook.id}.wrapper.sh`,
      content: renderClaudeHookWrapper(hook, mapping, manifestFile),
      sourceFiles: [hook.scriptFile, manifestFile],
      mode: 0o755,
      managed: true,
    });

    // 3. settings.json wiring entry, grouped by event. The command respects a
    //    custom CLAUDE_CONFIG_DIR and defaults to $HOME/.claude; it is wrapped in
    //    literal double-quotes so a resolved path containing spaces stays safe.
    //    No build-time absolute HOME is embedded.
    const entry: SettingsHookEntry = {
      hooks: [{ type: 'command', command: hookCommand(hook.id) }],
    };
    if (mapping.matcher) entry.matcher = mapping.matcher;
    (events[mapping.event] ??= []).push(entry);
    sources.push(hook.scriptFile);
  }

  files.push({
    relativePath: 'settings.json',
    content: JSON.stringify({ hooks: events }, null, 2) + '\n',
    sourceFiles: [...sources, manifestFile],
    managed: false,
    mergeTarget: '~/.claude/settings.json',
    managedPaths: Object.keys(events).map((event) => `hooks.${event}`),
  });

  return files;
}

/** Config-dir-aware, space-safe command string for a hook wrapper. */
function hookCommand(hookId: string): string {
  return `"\${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/${hookId}.wrapper.sh"`;
}

/** Insert the managed banner after a shebang line (or at the top if none). */
function injectBanner(raw: string, sourceFiles: string[]): string {
  const banner = managedHeader('hash', sourceFiles);
  const lines = raw.split('\n');
  if (lines[0]?.startsWith('#!')) {
    return [lines[0], banner, ...lines.slice(1)].join('\n');
  }
  return banner + '\n' + raw;
}
