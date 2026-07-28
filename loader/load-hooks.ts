import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Hook, HookTrigger, HookTarget, Diagnostic } from './model.js';

interface RawHookEntry {
  trigger?: HookTrigger;
  blocking?: boolean;
  targets?: HookTarget[];
  env?: Record<string, string>;
  description?: string;
}
interface RawManifest {
  hooks?: Record<string, RawHookEntry>;
}

/**
 * Load core/hooks/*.sh joined with core/hooks/manifest.yaml metadata.
 * Reports drift both ways: a script with no manifest row, or a row with no script.
 */
export function loadHooks(hooksDir: string): { hooks: Hook[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const manifestPath = path.join(hooksDir, 'manifest.yaml');

  let rows: Record<string, RawHookEntry> = {};
  if (existsSync(manifestPath)) {
    const parsed = (parseYaml(readFileSync(manifestPath, 'utf8')) ?? {}) as RawManifest;
    rows = parsed.hooks ?? {};
  } else {
    diagnostics.push({
      level: 'error',
      category: 'hooks',
      message: 'manifest.yaml not found; cannot resolve hook triggers.',
      sourceFile: manifestPath,
    });
  }

  const scripts = readdirSync(hooksDir)
    .filter((f) => f.endsWith('.sh'))
    .map((f) => f.replace(/\.sh$/, ''))
    .sort();

  const hooks: Hook[] = [];
  for (const id of scripts) {
    const scriptFile = path.join(hooksDir, `${id}.sh`);
    const row = rows[id];
    if (!row) {
      diagnostics.push({
        level: 'error',
        category: 'hooks',
        message: `${id}.sh has no entry in manifest.yaml.`,
        sourceFile: scriptFile,
      });
      continue;
    }
    if (!row.trigger) {
      diagnostics.push({
        level: 'error',
        category: 'hooks',
        message: `hook "${id}" is missing a trigger in manifest.yaml.`,
        sourceFile: manifestPath,
      });
      continue;
    }
    const hook: Hook = {
      id,
      scriptFile,
      trigger: row.trigger,
      blocking: row.blocking ?? false,
      targets: row.targets ?? [],
    };
    if (row.env) hook.env = row.env;
    if (row.description) hook.description = row.description;
    hooks.push(hook);
  }

  for (const id of Object.keys(rows)) {
    if (!scripts.includes(id)) {
      diagnostics.push({
        level: 'error',
        category: 'hooks',
        message: `manifest.yaml lists hook "${id}" but ${id}.sh does not exist.`,
        sourceFile: manifestPath,
      });
    }
  }

  return { hooks, diagnostics };
}
