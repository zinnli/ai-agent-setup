import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import type { GeneratedFile } from '../../src/adapters/types.js';
import { projectRoot, snapshotsDir } from './paths.js';

/** Deterministic, machine-independent serialization of rendered files. */
export function serializeFiles(files: GeneratedFile[]): string {
  return [...files]
    .sort(
      (a, b) =>
        (a.root ?? 'install').localeCompare(b.root ?? 'install') ||
        a.relativePath.localeCompare(b.relativePath),
    )
    .map((f) => {
      const sources = f.sourceFiles.map((s) => path.relative(projectRoot, s)).join(', ');
      const header = `=== [${f.root ?? 'install'}] ${f.relativePath} (managed=${f.managed}${f.mode ? ` mode=${f.mode.toString(8)}` : ''}) ===`;
      const merge = f.managed
        ? ''
        : `mergeTarget: ${f.mergeTarget ?? '(none)'}\nformat: ${f.format ?? 'json'}\nstrategy: ${f.mergeStrategy ?? 'replace-keys'}\nmanagedPaths: ${(f.managedPaths ?? []).join(', ')}\n`;
      return `${header}\nsources: ${sources}\n${merge}---\n${f.content}`;
    })
    .join('\n\n');
}

/** Compare `actual` to a committed snapshot, regenerating it under UPDATE_SNAPSHOTS=1. */
export function matchSnapshot(relPath: string, actual: string): void {
  const snapPath = path.join(snapshotsDir, relPath);
  if (process.env.UPDATE_SNAPSHOTS === '1' || !existsSync(snapPath)) {
    mkdirSync(path.dirname(snapPath), { recursive: true });
    writeFileSync(snapPath, actual);
    return;
  }
  const expected = readFileSync(snapPath, 'utf8');
  assert.equal(actual, expected, `${relPath} drifted. Run with UPDATE_SNAPSHOTS=1 to update.`);
}
