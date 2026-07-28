import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Agent } from './model.js';

interface RawAgent {
  name?: string;
  description?: string;
  mode?: string;
  skills?: string[];
  instructions?: string[];
}

/** Load core/agents/*.yaml into Agent[]. Missing fields are left for validate.ts. */
export function loadAgents(agentsDir: string): Agent[] {
  return readdirSync(agentsDir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort()
    .map((file) => {
      const sourceFile = path.join(agentsDir, file);
      const raw = (parseYaml(readFileSync(sourceFile, 'utf8')) ?? {}) as RawAgent;
      return {
        name: raw.name ?? path.basename(file).replace(/\.ya?ml$/, ''),
        description: raw.description ?? '',
        mode: raw.mode ?? '',
        skills: raw.skills ?? [],
        instructions: raw.instructions ?? [],
        sourceFile,
      } satisfies Agent;
    });
}
