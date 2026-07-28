import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Instruction, Diagnostic } from './model.js';

interface OrderFile {
  order?: string[];
}

/**
 * Load core/instructions/*.md into ordered Instruction[].
 *
 * Precedence comes from instructions/order.yaml (low -> high priority). Files not
 * listed there are appended after listed ones, each producing a warn Diagnostic.
 */
export function loadInstructions(instructionsDir: string): {
  instructions: Instruction[];
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const orderPath = path.join(instructionsDir, 'order.yaml');

  let order: string[] = [];
  if (existsSync(orderPath)) {
    const parsed = parseYaml(readFileSync(orderPath, 'utf8')) as OrderFile | null;
    order = parsed?.order ?? [];
  } else {
    diagnostics.push({
      level: 'warn',
      category: 'instructions',
      message: 'order.yaml not found; instructions ordered alphabetically.',
      sourceFile: orderPath,
    });
  }

  const mdFiles = readdirSync(instructionsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort();

  const orderedIds: string[] = [];
  for (const id of order) {
    if (mdFiles.includes(id)) {
      orderedIds.push(id);
    } else {
      diagnostics.push({
        level: 'warn',
        category: 'instructions',
        message: `order.yaml lists "${id}" but ${id}.md does not exist.`,
        sourceFile: orderPath,
      });
    }
  }
  for (const id of mdFiles) {
    if (!orderedIds.includes(id)) {
      orderedIds.push(id);
      if (order.length > 0) {
        diagnostics.push({
          level: 'warn',
          category: 'instructions',
          message: `${id}.md is not listed in order.yaml; appended at the end.`,
          sourceFile: path.join(instructionsDir, `${id}.md`),
        });
      }
    }
  }

  const instructions: Instruction[] = orderedIds.map((id, i) => {
    const sourceFile = path.join(instructionsDir, `${id}.md`);
    return {
      id,
      order: i,
      content: readFileSync(sourceFile, 'utf8').trimEnd(),
      sourceFile,
    };
  });

  return { instructions, diagnostics };
}
