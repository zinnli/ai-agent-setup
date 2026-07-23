import type { CoreModel } from '../../core/model.js';
import type { GeneratedFile } from '../types.js';

/**
 * Render enabled MCP servers as a structural-merge fragment for Claude's
 * USER-GLOBAL config file, ~/.claude.json (NOT the project-scoped .mcp.json).
 *
 * The emitted JSON is a pure fragment — only the object paths this tool owns
 * (mcpServers.<name>) — with no provenance keys polluting Claude-owned JSON.
 * Provenance lives in GeneratedFile metadata (sourceFiles, mergeTarget,
 * managedPaths) and, at install time, the manifest. Disabled servers are
 * omitted; ${VAR} refs are preserved verbatim (never resolved, never a secret).
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
        : { type: s.transport, url: s.url, ...(hasEnv ? { env: s.env } : {}) };
    managedPaths.push(`mcpServers.${s.name}`);
  }

  const sources = [...new Set(enabled.map((s) => s.sourceFile))];

  return [
    {
      relativePath: '.claude.json',
      root: 'home',
      content: JSON.stringify({ mcpServers }, null, 2) + '\n',
      sourceFiles: sources,
      managed: false,
      mergeTarget: '~/.claude.json',
      managedPaths,
    },
  ];
}
