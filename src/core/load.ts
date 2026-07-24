import path from 'node:path';
import type { CoreModel, Diagnostic } from './model.js';
import { loadInstructions } from './load-instructions.js';
import { loadAgents } from './load-agents.js';
import { loadSkills } from './load-skills.js';
import { loadHooks } from './load-hooks.js';
import { loadMcp } from './load-mcp.js';
import { validateCore } from './validate.js';

export interface LoadResult {
  core: CoreModel;
  diagnostics: Diagnostic[];
}

/**
 * Read the whole core/ tree into the normalized model and validate it.
 * Loader-level diagnostics (parse/drift) and validation diagnostics are merged.
 */
export function loadCore(coreDir: string): LoadResult {
  const diagnostics: Diagnostic[] = [];

  const instr = loadInstructions(path.join(coreDir, 'instructions'));
  diagnostics.push(...instr.diagnostics);

  const agents = loadAgents(path.join(coreDir, 'agents'));
  const skills = loadSkills(path.join(coreDir, 'skills'));

  const hookResult = loadHooks(path.join(coreDir, 'hooks'));
  diagnostics.push(...hookResult.diagnostics);

  const mcpServers = loadMcp(path.join(coreDir, 'mcp', 'servers.yaml'));

  const core: CoreModel = {
    instructions: instr.instructions,
    agents,
    skills,
    hooks: hookResult.hooks,
    mcpServers,
  };

  diagnostics.push(...validateCore(core));

  return { core, diagnostics };
}
