import TOML from '@iarna/toml';
import type { CoreModel } from '../../core/model.js';
import type { GeneratedFile } from '../types.js';
import { classifyMcpEnv } from '../shared/mcp-env.js';

/**
 * Render enabled MCP servers as a structural-merge fragment for Codex's
 * ~/.codex/config.toml, under [mcp_servers.<id>].
 *
 * Verified against codex-cli 0.142.5 (`codex mcp add`/`get`) + the official
 * manual:
 *   stdio: command, args, env (LITERAL values), env_vars (["NAME"] — forward
 *          named vars from the parent process; the correct home for a ${VAR} ref).
 *   http : url, bearer_token_env_var, env_http_headers / http_headers.
 *
 * A core `${NOTION_TOKEN}` reference therefore becomes `env_vars = ["NOTION_TOKEN"]`,
 * NOT a literal `env` entry — the secret is never written, only its var name.
 * Malformed/renamed references are skipped here (validate.ts reports them) and
 * recorded in COMPATIBILITY.md by the adapter; they are never emitted as literals.
 */
export function renderMcp(core: CoreModel): GeneratedFile[] {
  const enabled = core.mcpServers.filter((s) => s.enabled);
  if (enabled.length === 0) return [];

  const mcpServers: Record<string, Record<string, unknown>> = {};
  const managedPaths: string[] = [];
  for (const s of enabled) {
    const env = classifyMcpEnv(s.env);
    const entry: Record<string, unknown> = {};
    if (s.transport === 'stdio') {
      entry.command = s.command;
      entry.args = s.args;
      if (Object.keys(env.literal).length > 0) entry.env = env.literal;
      if (env.forward.length > 0) entry.env_vars = env.forward;
    } else {
      // http/sse: only the url maps cleanly; header/token env fields require
      // intent (bearer vs header) that core does not model, so any env entries
      // are left to COMPATIBILITY.md rather than guessed.
      entry.url = s.url;
    }
    mcpServers[s.name] = entry;
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
