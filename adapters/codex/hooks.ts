import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { CoreModel } from '../../loader/model.js';
import type { GeneratedFile } from '../types.js';
import { managedHeader } from '../shared/managed-header.js';
import { mapCodexEvent } from './event-map.js';
import { renderCodexHookWrapper } from './hook-wrapper.js';

interface CodexHookEntry {
  matcher?: string;
  hooks: { type: 'command'; command: string }[];
}

/**
 * Render Codex hooks: copy each neutral script, emit its wrapper shim, and build
 * the hooks.json merge fragment. Verified against codex-cli 0.142.5 + the manual:
 * hooks.json nests events under a top-level "hooks" object (e.g.
 * { "hooks": { "PreToolUse": [ { matcher, hooks:[{type,command}] } ] } }) — the
 * same shape as Claude's settings.json, and matched by the inline TOML
 * [[hooks.PreToolUse]] form. Commands respect a custom CODEX_HOME and are quoted
 * for spaces.
 */
export function renderHooks(core: CoreModel): GeneratedFile[] {
  if (core.hooks.length === 0) return [];

  const files: GeneratedFile[] = [];
  const events: Record<string, CodexHookEntry[]> = {};
  const sources: string[] = [];
  const manifestFile = path.join(path.dirname(core.hooks[0]!.scriptFile), 'manifest.yaml');

  for (const hook of core.hooks) {
    const mapping = mapCodexEvent(hook);

    files.push({
      relativePath: `hooks/${hook.id}.sh`,
      content: injectBanner(readFileSync(hook.scriptFile, 'utf8'), [hook.scriptFile]),
      sourceFiles: [hook.scriptFile],
      mode: 0o755,
      managed: true,
    });
    files.push({
      relativePath: `hooks/${hook.id}.wrapper.sh`,
      content: renderCodexHookWrapper(hook, mapping, manifestFile),
      sourceFiles: [hook.scriptFile, manifestFile],
      mode: 0o755,
      managed: true,
    });

    const entry: CodexHookEntry = {
      hooks: [{ type: 'command', command: hookCommand(hook.id) }],
    };
    if (mapping.matcher) entry.matcher = mapping.matcher;
    (events[mapping.event] ??= []).push(entry);
    sources.push(hook.scriptFile);
  }

  files.push({
    relativePath: 'hooks.json',
    content: JSON.stringify({ hooks: events }, null, 2) + '\n',
    sourceFiles: [...sources, manifestFile],
    managed: false,
    mergeTarget: '~/.codex/hooks.json',
    managedPaths: Object.keys(events).map((event) => `hooks.${event}`),
    mergeStrategy: 'append-array',
    format: 'json',
  });

  return files;
}

/** Config-dir-aware, space-safe command string for a Codex hook wrapper. */
function hookCommand(hookId: string): string {
  return `"\${CODEX_HOME:-$HOME/.codex}/hooks/${hookId}.wrapper.sh"`;
}

function injectBanner(raw: string, sourceFiles: string[]): string {
  const banner = managedHeader('hash', sourceFiles);
  const lines = raw.split('\n');
  if (lines[0]?.startsWith('#!')) {
    return [lines[0], banner, ...lines.slice(1)].join('\n');
  }
  return banner + '\n' + raw;
}
