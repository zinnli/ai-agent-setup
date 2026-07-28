import path from 'node:path';
import type { CoreModel, Diagnostic } from '../../loader/model.js';
import type { Adapter, RenderResult } from '../types.js';
import { UnsupportedReport } from '../shared/unsupported.js';
import { classifyMcpEnv } from '../shared/mcp-env.js';
import { renderInstructions } from './instructions.js';
import { renderAgents } from './agents.js';
import { renderSkills } from './skills.js';
import { renderMcp } from './mcp.js';
import { renderHooks } from './hooks.js';

/**
 * Adapter that renders core/ into Codex's native config layout (all paths
 * verified against codex-cli 0.142.5 + the official manual):
 * - instructions -> ~/.codex/AGENTS.md          (user-global, confirmed)
 * - agents       -> ~/.codex/agents/<name>.toml
 * - skills       -> ~/.agents/skills/<name>/SKILL.md   (USER skill scope)
 * - mcp          -> ~/.codex/config.toml [mcp_servers.<id>]  (structural merge)
 * - hooks        -> ~/.codex/hooks.json + ~/.codex/hooks/*   (structural merge)
 *
 * Every category maps to a native Codex surface. Only individual fields/mappings
 * that Codex genuinely cannot express are recorded in COMPATIBILITY.md (surfaced
 * later as doctor warnings) — never a whole category.
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

/**
 * Record only the individual fields Codex genuinely cannot express. After
 * verification against codex-cli 0.142.5 + the manual, the AGENTS.md path, the
 * hooks.json shape, matchers, tool_input fields, and MCP env forwarding are all
 * confirmed native — so nothing category-wide is recorded here.
 */
function recordCompatibility(core: CoreModel, report: UnsupportedReport): void {
  // apply_patch/Edit/Write deliver the target path embedded in tool_input.command
  // (the patch text), not a dedicated file_path field, so file-access hooks match
  // against that text rather than a clean path.
  const fileHooks = core.hooks.filter(
    (h) => h.trigger === 'before-file-access' || h.trigger === 'after-file-change',
  );
  if (fileHooks.length > 0) {
    report.add(
      'hooks',
      'apply_patch/Edit/Write expose the edited path only inside tool_input.command (patch text); file-access hooks match against that text, not a dedicated file_path field.',
      'core/hooks/manifest.yaml',
      'tool_input.file_path',
    );
  }

  // MCP env references that Codex's env_vars cannot express (rename / malformed).
  for (const s of core.mcpServers.filter((m) => m.enabled)) {
    const env = classifyMcpEnv(s.env);
    for (const { key, ref } of env.renamed) {
      report.add(
        'mcp',
        `env "${key}" references \${${ref}}; Codex env_vars forwards a var under its own name and cannot rename ${ref}->${key}, so it is omitted.`,
        'core/mcp/servers.yaml',
        `env.${key}`,
      );
    }
    for (const { key } of env.malformed) {
      report.add(
        'mcp',
        `env "${key}" is a malformed \${VAR} reference and is omitted (never written literally); fix it in core.`,
        'core/mcp/servers.yaml',
        `env.${key}`,
      );
    }
    if (s.transport !== 'stdio' && Object.keys(s.env).length > 0) {
      report.add(
        'mcp',
        `http/sse server "${s.name}" has env entries; Codex http MCP uses bearer_token_env_var / env_http_headers, which core does not model, so env is omitted.`,
        'core/mcp/servers.yaml',
        'env',
      );
    }
  }
}
