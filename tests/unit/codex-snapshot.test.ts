import { test } from 'node:test';
import path from 'node:path';
import { loadCore } from '../../src/core/load.js';
import { codexAdapter } from '../../src/adapters/codex/index.js';
import { projectRoot } from '../helpers/paths.js';
import { serializeFiles, matchSnapshot } from '../helpers/snapshot.js';

test('codex adapter render matches snapshot', () => {
  const { core } = loadCore(path.join(projectRoot, 'core'));
  const { files } = codexAdapter.render(core);
  matchSnapshot('codex/render.snap', serializeFiles(files));
});
