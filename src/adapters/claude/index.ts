import path from 'node:path';
import type { CoreModel, Diagnostic } from '../../core/model.js';
import type { Adapter, RenderResult } from '../types.js';
import { UnsupportedReport } from '../shared/unsupported.js';
import { renderInstructions } from './instructions.js';
import { renderAgents } from './agents.js';
import { renderSkills } from './skills.js';
import { renderMcp } from './mcp.js';
import { renderHooks } from './hooks.js';

/** Adapter that renders core/ into Claude Code's native config layout (~/.claude). */
export const claudeAdapter: Adapter = {
  id: 'claude',

  installRoot(home: string): string {
    return path.join(home, '.claude');
  },

  skillsRoot(home: string): string {
    return path.join(home, '.claude', 'skills');
  },

  validateCore(_core: CoreModel): Diagnostic[] {
    return [];
  },

  render(core: CoreModel): RenderResult {
    const unsupported = new UnsupportedReport('claude');
    const files = [
      ...renderInstructions(core),
      ...renderAgents(core),
      ...renderSkills(core),
      ...renderMcp(core),
      ...renderHooks(core),
    ];
    return { files, unsupported: unsupported.all() };
  },
};
