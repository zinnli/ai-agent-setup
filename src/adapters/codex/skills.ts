import type { CoreModel } from '../../core/model.js';
import type { GeneratedFile } from '../types.js';
import { renderSkill } from '../shared/skill-render.js';

/**
 * Render all skills to <skillsRoot>/<name>/SKILL.md (+ resources). Codex consumes
 * the same SKILL.md-directory format as Claude; only the skillsRoot differs
 * (~/.agents/skills for Codex), which the adapter supplies.
 */
export function renderSkills(core: CoreModel): GeneratedFile[] {
  return core.skills.flatMap(renderSkill);
}
