import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadCore } from '../../src/core/load.js';
import { claudeAdapter } from '../../src/adapters/claude/index.js';
import type { GeneratedFile } from '../../src/adapters/types.js';
import { projectRoot, snapshotsDir } from '../helpers/paths.js';

/** Deterministic, machine-independent serialization of rendered files. */
function serialize(files: GeneratedFile[]): string {
  return [...files]
    .sort((a, b) => (a.root ?? 'install').localeCompare(b.root ?? 'install') || a.relativePath.localeCompare(b.relativePath))
    .map((f) => {
      const sources = f.sourceFiles.map((s) => path.relative(projectRoot, s)).join(', ');
      const header = `=== [${f.root ?? 'install'}] ${f.relativePath} (managed=${f.managed}${f.mode ? ` mode=${f.mode.toString(8)}` : ''}) ===`;
      const merge = f.managed
        ? ''
        : `mergeTarget: ${f.mergeTarget ?? '(none)'}\nmanagedPaths: ${(f.managedPaths ?? []).join(', ')}\n`;
      return `${header}\nsources: ${sources}\n${merge}---\n${f.content}`;
    })
    .join('\n\n');
}

test('claude adapter render matches snapshot', () => {
  const { core } = loadCore(path.join(projectRoot, 'core'));
  const { files } = claudeAdapter.render(core);
  const actual = serialize(files);

  const snapPath = path.join(snapshotsDir, 'claude', 'render.snap');
  if (process.env.UPDATE_SNAPSHOTS === '1' || !existsSync(snapPath)) {
    mkdirSync(path.dirname(snapPath), { recursive: true });
    writeFileSync(snapPath, actual);
    return;
  }
  const expected = readFileSync(snapPath, 'utf8');
  assert.equal(actual, expected, 'Claude render drifted from snapshot. Run with UPDATE_SNAPSHOTS=1 to update.');
});
