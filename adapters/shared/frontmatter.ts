import { stringify as stringifyYaml } from 'yaml';

/**
 * Render a YAML frontmatter block (--- delimited). Uses the yaml serializer so
 * special characters, Korean text, and lists are always quoted/escaped safely.
 * Key order follows insertion order of the passed object.
 */
export function frontmatter(fields: Record<string, unknown>): string {
  const body = stringifyYaml(fields, { lineWidth: 0 }).trimEnd();
  return `---\n${body}\n---`;
}
