import type { CoreModel } from '../../core/model.js';
import type { GeneratedFile } from '../types.js';
import { renderSkill } from '../shared/skill-render.js';

/** Render all skills to <skillsRoot>/<name>/SKILL.md (+ resources). Shared logic. */
export function renderSkills(core: CoreModel): GeneratedFile[] {
  return core.skills.flatMap(renderSkill);
}
