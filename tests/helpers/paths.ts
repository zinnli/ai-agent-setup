import path from 'node:path';

/** Tests run from the repo root (npm test), so fixtures/snapshots live under cwd. */
export const projectRoot = process.cwd();
export const fixturesDir = path.join(projectRoot, 'tests', 'fixtures');
export const snapshotsDir = path.join(projectRoot, 'tests', 'snapshots');
export const minimalCore = path.join(fixturesDir, 'core-minimal');
