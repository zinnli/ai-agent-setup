import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Skill, SkillResource } from './model.js';

interface RawSkill {
  name?: string;
  description?: string;
  when_to_use?: string[];
  not_for?: string[];
  inputs?: string[];
  outputs?: string[];
  related?: string[];
  requires?: string[];
}

/**
 * Load core/skills/<name>/ folders. Each has skill.yaml + body.md + resources/*.
 * Resources are read recursively and stored with paths relative to the skill dir.
 */
export function loadSkills(skillsDir: string): Skill[] {
  return readdirSync(skillsDir)
    .filter((entry) => statSync(path.join(skillsDir, entry)).isDirectory())
    .sort()
    .map((folder) => {
      const dir = path.join(skillsDir, folder);
      const yamlPath = path.join(dir, 'skill.yaml');
      const bodyPath = path.join(dir, 'body.md');
      const raw = (parseYaml(readFileSync(yamlPath, 'utf8')) ?? {}) as RawSkill;

      const skill: Skill = {
        name: raw.name ?? folder,
        description: raw.description ?? '',
        whenToUse: raw.when_to_use ?? [],
        notFor: raw.not_for ?? [],
        inputs: raw.inputs ?? [],
        outputs: raw.outputs ?? [],
        related: raw.related ?? [],
        body: existsSync(bodyPath) ? readFileSync(bodyPath, 'utf8').trimEnd() : '',
        resources: collectResources(dir),
        dir,
      };
      if (raw.requires) skill.requires = raw.requires;
      return skill;
    });
}

function collectResources(skillDir: string): SkillResource[] {
  const resourcesDir = path.join(skillDir, 'resources');
  if (!existsSync(resourcesDir)) return [];

  const out: SkillResource[] = [];
  const walk = (abs: string) => {
    for (const entry of readdirSync(abs).sort()) {
      const full = path.join(abs, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        out.push({
          relPath: path.relative(skillDir, full),
          content: readFileSync(full, 'utf8'),
        });
      }
    }
  };
  walk(resourcesDir);
  return out;
}
