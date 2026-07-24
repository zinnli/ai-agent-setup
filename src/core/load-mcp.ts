import { readFileSync, existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { McpServer, McpTransport } from './model.js';

interface RawServer {
  enabled?: boolean;
  transport?: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}
interface RawServers {
  servers?: Record<string, RawServer>;
}

/** Load core/mcp/servers.yaml, flattening servers.<name> into McpServer[]. */
export function loadMcp(serversFile: string): McpServer[] {
  if (!existsSync(serversFile)) return [];
  const parsed = (parseYaml(readFileSync(serversFile, 'utf8')) ?? {}) as RawServers;
  const servers = parsed.servers ?? {};

  return Object.entries(servers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, raw]) => {
      const server: McpServer = {
        name,
        enabled: raw.enabled ?? false,
        transport: raw.transport ?? 'stdio',
        args: raw.args ?? [],
        env: raw.env ?? {},
        sourceFile: serversFile,
      };
      if (raw.command) server.command = raw.command;
      if (raw.url) server.url = raw.url;
      return server;
    });
}
