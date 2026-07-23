import TOML from '@iarna/toml';
import type { CoreModel } from '../../core/model.js';
import type { GeneratedFile } from '../types.js';

/**
 * Render enabled MCP servers as a structural-merge fragment for Codex's
 * ~/.codex/config.toml, under [mcp_servers.<id>] (verified schema: command, args,
 * env for stdio; url for http). Disabled servers are omitted. ${VAR} references
 * are preserved verbatim and never resolved.
 *
 * NOTE: whether Codex expands ${VAR} in forwarded MCP env values is not confirmed
 * by the official docs; the reference is preserved as-is and this is recorded in
 * COMPATIBILITY.md for manual verification.
 */
export function renderMcp(core: CoreModel): GeneratedFile[] {
  const enabled = core.mcpServers.filter((s) => s.enabled);
  if (enabled.length === 0) return [];

  const mcpServers: Record<string, Record<string, unknown>> = {};
  const managedPaths: string[] = [];
  for (const s of enabled) {
    const hasEnv = Object.keys(s.env).length > 0;
    mcpServers[s.name] =
      s.transport === 'stdio'
        ? { command: s.command, args: s.args, ...(hasEnv ? { env: s.env } : {}) }
        : { url: s.url, ...(hasEnv ? { env: s.env } : {}) };
    managedPaths.push(`mcp_servers.${s.name}`);
  }

  const sources = [...new Set(enabled.map((s) => s.sourceFile))];
  const content = TOML.stringify({ mcp_servers: mcpServers } as TOML.JsonMap);

  return [
    {
      relativePath: 'config.toml',
      content,
      sourceFiles: sources,
      managed: false,
      mergeTarget: '~/.codex/config.toml',
      managedPaths,
      mergeStrategy: 'replace-keys',
      format: 'toml',
    },
  ];
}
