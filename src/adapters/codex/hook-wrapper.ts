import type { Hook } from '../../core/model.js';
import type { CodexEventMapping } from './event-map.js';
import { managedHeader } from '../shared/managed-header.js';

/**
 * Generate the Codex-side wrapper script for a neutral hook.
 *
 * Protocol bridge (verified against codex-cli 0.142.5 + learn.chatgpt.com/docs/hooks):
 * Codex delivers the event as one JSON object on stdin and accepts **exit code 2**
 * (with a reason on stderr) as a block for a PreToolUse tool call — the same exit
 * convention as Claude, but the two schemas are validated separately. The neutral
 * core script takes a plain string on $1/stdin and signals with exit 1; the
 * wrapper extracts `tool_input.command` (which carries the shell command for Bash
 * AND the patch text for apply_patch/Edit/Write), calls the script, and maps a
 * blocking non-zero exit to 2. Non-blocking hooks always exit 0.
 *
 * NOTE: apply_patch delivers the target path embedded in the patch text rather
 * than a dedicated field, so the secret guard matches against that text. This
 * single caveat is recorded in COMPATIBILITY.md.
 */
export function renderCodexHookWrapper(
  hook: Hook,
  mapping: CodexEventMapping,
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
      `# Best-effort extraction of tool_input.* from Codex's event JSON.`,
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
      '# Neutral script exits non-zero to block; Codex treats exit code 2 as a block.',
      'if [[ $code -ne 0 ]]; then',
      '  echo "ai-agent-setup: blocked by ' + hook.id + '" >&2',
      '  exit 2',
      'fi',
      'exit 0',
    );
  } else {
    lines.push('# Non-blocking hook: never interrupt Codex.', 'exit 0');
  }

  return lines.join('\n') + '\n';
}
