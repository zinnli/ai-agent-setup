import type { Skill } from '../../loader/model.js';
import type { GeneratedFile } from '../types.js';
import { managedHeader } from './managed-header.js';
import { frontmatter } from './frontmatter.js';

/**
 * Render one skill folder into GeneratedFile[] anchored to the tool's skillsRoot.
 * Claude and Codex both consume a directory containing SKILL.md (frontmatter
 * name+description + body) plus verbatim resource files, so this is fully shared;
 * only the skillsRoot differs (handled by each adapter). The skill.yaml metadata
 * that has no frontmatter home (when_to_use, etc.) is appended as body sections.
 */
export function renderSkill(skill: Skill): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const yamlSource = `${skill.dir}/skill.yaml`;
  const bodySource = `${skill.dir}/body.md`;

  // Frontmatter MUST be the first thing in SKILL.md — Claude and Codex read the
  // name/description block only when it starts on line 1. The provenance banner
  // therefore goes AFTER the frontmatter, inside the markdown body.
  const parts = [
    frontmatter({ name: skill.name, description: skill.description }),
    managedHeader('md', [yamlSource, bodySource]),
    skill.body,
    metaAppendix(skill),
  ].filter((p) => p !== '');

  files.push({
    relativePath: `${skill.name}/SKILL.md`,
    content: parts.join('\n\n').trimEnd() + '\n',
    sourceFiles: [yamlSource, bodySource],
    managed: true,
    root: 'skills',
  });

  for (const res of skill.resources) {
    files.push({
      relativePath: `${skill.name}/${res.relPath}`,
      content: res.content,
      sourceFiles: [`${skill.dir}/${res.relPath}`],
      managed: true,
      root: 'skills',
    });
  }

  return files;
}

function metaAppendix(skill: Skill): string {
  const sections: string[] = [];
  const list = (title: string, items: string[]) => {
    if (items.length) sections.push(`### ${title}\n` + items.map((i) => `- ${i}`).join('\n'));
  };
  list('사용 시점', skill.whenToUse);
  list('사용하지 않을 때', skill.notFor);
  list('입력', skill.inputs);
  list('출력', skill.outputs);
  if (skill.requires?.length) list('요구사항', skill.requires);
  list('관련 스킬', skill.related);
  return sections.length ? '## 실행 정보\n\n' + sections.join('\n\n') : '';
}
