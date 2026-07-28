import type { CoreModel } from '../../loader/model.js';
import type { GeneratedFile } from '../types.js';
import { renderInstructionsDoc } from '../shared/instructions-doc.js';

/** Combine core/instructions/*.md into CLAUDE.md (full ownership). */
export function renderInstructions(core: CoreModel): GeneratedFile[] {
  return renderInstructionsDoc(core, 'CLAUDE.md');
}
