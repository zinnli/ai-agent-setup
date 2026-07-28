import { test } from 'node:test';
import path from 'node:path';
import { loadCore } from '../../loader/load.js';
import { claudeAdapter } from '../../adapters/claude/index.js';
import { projectRoot } from '../helpers/paths.js';
import { serializeFiles, matchSnapshot } from '../helpers/snapshot.js';

test('claude adapter render matches snapshot', () => {
  const { core } = loadCore(path.join(projectRoot, 'core'));
  const { files } = claudeAdapter.render(core);
  matchSnapshot('claude/render.snap', serializeFiles(files));
});
