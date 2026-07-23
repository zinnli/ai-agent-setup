import type { CoreModel } from '../../core/model.js';
import type { GeneratedFile } from '../types.js';
import { managedHeader } from '../shared/managed-header.js';

/**
 * Combine core/instructions/*.md into a single CLAUDE.md, in order.yaml order.
 * Ordering encodes precedence (later = higher priority); a generated preamble
 * states that explicitly. Original headings are preserved verbatim.
 */
export function renderInstructions(core: CoreModel): GeneratedFile[] {
  if (core.instructions.length === 0) return [];
  const sources = core.instructions.map((i) => i.sourceFile);

  const preamble = [
    managedHeader('md', sources),
    '# 에이전트 기본 지침',
    '아래 규칙을 순서대로 적용한다. 뒤에 오는 규칙일수록 우선하며, 충돌 시 안전 규칙을 최우선한다.',
  ].join('\n\n');

  const body = core.instructions.map((i) => i.content).join('\n\n---\n\n');

  return [
    {
      relativePath: 'CLAUDE.md',
      content: `${preamble}\n\n---\n\n${body}\n`,
      sourceFiles: sources,
      managed: true,
    },
  ];
}
