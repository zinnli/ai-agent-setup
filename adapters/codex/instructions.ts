import type { CoreModel } from '../../loader/model.js';
import type { GeneratedFile } from '../types.js';
import { renderInstructionsDoc } from '../shared/instructions-doc.js';

/** Combine core/instructions/*.md into AGENTS.md (Codex user-global instructions). */
export function renderInstructions(core: CoreModel): GeneratedFile[] {
  return renderInstructionsDoc(core, 'AGENTS.md');
}
