import type { CoreModel } from '../../loader/model.js';
import type { GeneratedFile } from '../types.js';
import { managedHeader } from '../shared/managed-header.js';
import { frontmatter } from '../shared/frontmatter.js';

/**
 * Render each agent into agents/<name>.md with Claude subagent frontmatter
 * (name, description) followed by mode note, rules, and referenced skills.
 */
export function renderAgents(core: CoreModel): GeneratedFile[] {
  return core.agents.map((a) => {
    // Claude reads subagent frontmatter only when it starts on line 1, so the
    // provenance banner goes after the frontmatter block, not before it.
    const parts = [
      frontmatter({ name: a.name, description: a.description }),
      managedHeader('md', [a.sourceFile]),
      `# ${a.name}`,
      a.description,
    ];
    const restrictions = modeRestrictions(a.mode);
    if (restrictions.length) {
      parts.push('## 작업 제한\n' + restrictions.map((r) => `- ${r}`).join('\n'));
    }
    if (a.instructions.length) {
      parts.push('## 규칙\n' + a.instructions.map((i) => `- ${i}`).join('\n'));
    }
    if (a.skills.length) {
      parts.push('## 사용할 수 있는 스킬\n' + a.skills.map((s) => `- ${s}`).join('\n'));
    }
    return {
      relativePath: `agents/${a.name}.md`,
      content: parts.join('\n\n').trimEnd() + '\n',
      sourceFiles: [a.sourceFile],
      managed: true,
    } satisfies GeneratedFile;
  });
}

/**
 * Translate a neutral `mode` into explicit behavioral restrictions. Claude does
 * not enforce a "read-only" agent mode, so we render it as concrete rules the
 * agent must follow rather than implying an enforced capability.
 */
function modeRestrictions(mode: string): string[] {
  if (mode === 'read-only') {
    return ['파일을 수정하지 않는다.', '명령은 코드 탐색과 검증 목적으로만 실행한다.'];
  }
  return [];
}
