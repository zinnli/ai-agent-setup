import type { Hook } from '../../core/model.js';
import type { ClaudeEventMapping } from './event-map.js';
import { managedHeader } from '../shared/managed-header.js';

/**
 * Generate the Claude-side wrapper script for a neutral hook.
 *
 * Protocol bridge: Claude delivers the event as JSON on stdin and treats
 * **exit code 2** as "block" (PreToolUse blocks the tool; Stop blocks stopping).
 * Our neutral core scripts instead take a plain string on $1/stdin and signal
 * with **exit 1**. The wrapper extracts the relevant tool_input field, calls the
 * neutral script, and maps a blocking non-zero exit to 2. Non-blocking hooks
 * always exit 0 so they can never interrupt Claude.
 */
export function renderClaudeHookWrapper(
  hook: Hook,
  mapping: ClaudeEventMapping,
  manifestFile: string,
): string {
  const header = managedHeader('hash', [hook.scriptFile, manifestFile]);
  const envExports = Object.entries(hook.env ?? {})
    .map(([k, v]) => `export ${k}="\${${k}:-${v}}"`)
    .join('\n');

  const lines: string[] = ['#!/usr/bin/env bash', header, 'set -uo pipefail', ''];
  if (envExports) lines.push(envExports, '');

  lines.push('DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"');
  lines.push('input="$(cat)"');
  lines.push('');

  const callsNeutral = `"$DIR/${hook.id}.sh"`;

  if (mapping.extractFields.length > 0) {
    const fields = mapping.extractFields.join(',');
    lines.push(
      `# Extract the relevant field(s) from Claude's event JSON (tool_input.*).`,
      `payload="$(printf '%s' "$input" | AAS_FIELDS="${fields}" node -e '` +
        `let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{` +
        `try{const j=JSON.parse(s);const ti=(j&&j.tool_input)||{};` +
        `for(const f of (process.env.AAS_FIELDS||"").split(",")){if(ti[f]){process.stdout.write(String(ti[f]));break;}}` +
        `}catch(e){}});' 2>/dev/null)"`,
      '',
      `${callsNeutral} "$payload"`,
    );
  } else {
    lines.push(
      `# This hook needs no field extraction (operates on the workspace / git state).`,
      callsNeutral,
    );
  }

  lines.push('code=$?', '');

  if (hook.blocking) {
    lines.push(
      '# Neutral script exits non-zero to block; Claude blocks on exit code 2.',
      'if [[ $code -ne 0 ]]; then',
      '  exit 2',
      'fi',
      'exit 0',
    );
  } else {
    lines.push('# Non-blocking hook: never interrupt Claude.', 'exit 0');
  }

  return lines.join('\n') + '\n';
}
