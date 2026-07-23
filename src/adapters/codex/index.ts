import path from 'node:path';
import type { CoreModel, Diagnostic } from '../../core/model.js';
import type { Adapter, RenderResult } from '../types.js';
import { UnsupportedReport } from '../shared/unsupported.js';
import { renderInstructions } from './instructions.js';
import { renderAgents } from './agents.js';
import { renderSkills } from './skills.js';
import { renderMcp } from './mcp.js';
import { renderHooks } from './hooks.js';

/**
 * Adapter that renders core/ into Codex's native config layout:
 * - instructions -> ~/.codex/AGENTS.md
 * - agents       -> ~/.codex/agents/<name>.toml
 * - skills       -> ~/.agents/skills/<name>/SKILL.md
 * - mcp          -> ~/.codex/config.toml [mcp_servers.<id>]  (structural merge)
 * - hooks        -> ~/.codex/hooks.json + ~/.codex/hooks/*   (structural merge)
 *
 * Every category maps to a native Codex surface. Only individual fields/mappings
 * that the official docs do not fully pin down are recorded in COMPATIBILITY.md
 * (surfaced later as doctor warnings) — never a whole category.
 */
export const codexAdapter: Adapter = {
  id: 'codex',

  installRoot(home: string): string {
    return path.join(home, '.codex');
  },

  skillsRoot(home: string): string {
    return path.join(home, '.agents', 'skills');
  },

  validateCore(_core: CoreModel): Diagnostic[] {
    return [];
  },

  render(core: CoreModel): RenderResult {
    const unsupported = new UnsupportedReport('codex');
    const files = [
      ...renderInstructions(core),
      ...renderAgents(core),
      ...renderSkills(core),
      ...renderMcp(core),
      ...renderHooks(core),
    ];
    recordCompatibility(core, unsupported);
    return { files, unsupported: unsupported.all() };
  },
};

/** Record the individual mappings the official Codex docs do not fully confirm. */
function recordCompatibility(core: CoreModel, report: UnsupportedReport): void {
  if (core.instructions.length > 0) {
    report.add(
      'instructions',
      'user-global instructions written to ~/.codex/AGENTS.md; confirm Codex loads a user-level AGENTS.md at this path (docs do not state it explicitly).',
      'core/instructions/*.md',
    );
  }
  const gateHooks = core.hooks.filter((h) => h.trigger === 'before-command' || h.trigger === 'before-file-access');
  if (gateHooks.length > 0) {
    report.add(
      'hooks',
      "PreToolUse wrappers extract tool_input.{command,file_path}; Codex's exact PreToolUse tool_input field names are not enumerated in the docs — verify in the manual checklist.",
      'core/hooks/manifest.yaml',
      'tool_input',
    );
  }
  if (core.hooks.length > 0) {
    report.add(
      'hooks',
      "hook matchers are omitted (fire on every occurrence of the event) because Codex's exact tool names are not documented; the wrapper allows when no field is extracted.",
      'core/hooks/manifest.yaml',
      'matcher',
    );
  }
  const envServers = core.mcpServers.filter((s) => s.enabled && Object.keys(s.env).length > 0);
  if (envServers.length > 0) {
    report.add(
      'mcp',
      'MCP env ${VAR} references are written literally; whether Codex expands them for forwarded env is not confirmed by the docs — verify the token resolves at runtime.',
      'core/mcp/servers.yaml',
      'env',
    );
  }
}
