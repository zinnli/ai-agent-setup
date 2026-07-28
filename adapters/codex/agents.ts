import TOML from '@iarna/toml';
import type { CoreModel, Agent } from '../../loader/model.js';
import type { GeneratedFile } from '../types.js';
import { managedHeader } from '../shared/managed-header.js';

/**
 * Render each agent into a Codex custom-agent definition: ~/.codex/agents/<name>.toml
 * with the verified fields name, description, developer_instructions. Our neutral
 * `mode` and `skills` have no dedicated Codex agent fields, so they are folded into
 * developer_instructions as explicit behavioral text (read-only mode is expressed
 * as restrictions, never as an implied native permission). model/reasoning_effort
 * are intentionally omitted — core does not specify them and we do not invent values.
 */
export function renderAgents(core: CoreModel): GeneratedFile[] {
  return core.agents.map((a) => {
    const toml = TOML.stringify({
      name: a.name,
      description: a.description,
      developer_instructions: developerInstructions(a),
    });
    const content = `${managedHeader('hash', [a.sourceFile])}\n\n${toml}`;
    return {
      relativePath: `agents/${a.name}.toml`,
      content,
      sourceFiles: [a.sourceFile],
      managed: true,
    } satisfies GeneratedFile;
  });
}

function developerInstructions(a: Agent): string {
  const lines: string[] = [];
  if (a.mode === 'read-only') {
    lines.push('작업 제한:');
    lines.push('- 파일을 수정하지 않는다.');
    lines.push('- 명령은 코드 탐색과 검증 목적으로만 실행한다.');
    lines.push('');
  }
  if (a.instructions.length) {
    lines.push('규칙:');
    for (const i of a.instructions) lines.push(`- ${i}`);
  }
  if (a.skills.length) {
    lines.push('');
    lines.push(`사용할 수 있는 스킬: ${a.skills.join(', ')}`);
  }
  return lines.join('\n').trim();
}
