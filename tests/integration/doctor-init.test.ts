import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { runInstall } from '../../commands/install.js';
import { runDoctor } from '../../commands/doctor.js';
import { runInit, detectProject } from '../../commands/init.js';
import { makeTempHome, silentLogger } from '../helpers/temp-home.js';

test('doctor: a clean install reports no errors', () => {
  const t = makeTempHome();
  try {
    runInstall({ target: 'all', home: t.home, logger: silentLogger });
    const { hasError, checks } = runDoctor({ target: 'all', home: t.home, logger: silentLogger });
    assert.equal(hasError, false);
    assert.ok(checks.some((c) => c.area.endsWith(':install') && c.message.includes('matches manifest')));
  } finally {
    t.cleanup();
  }
});

test('doctor: a missing managed file is reported as an error', () => {
  const t = makeTempHome();
  try {
    runInstall({ target: 'claude', home: t.home, logger: silentLogger });
    rmSync(path.join(t.home, '.claude/CLAUDE.md'), { force: true });
    const { hasError, checks } = runDoctor({ target: 'claude', home: t.home, logger: silentLogger });
    assert.equal(hasError, true);
    assert.ok(checks.some((c) => c.level === 'error' && c.message.includes('missing')));
  } finally {
    t.cleanup();
  }
});

test('doctor: a user-modified managed file is a warning, not an error', () => {
  const t = makeTempHome();
  try {
    runInstall({ target: 'claude', home: t.home, logger: silentLogger });
    t.write('.claude/CLAUDE.md', 'edited');
    const { hasError, checks } = runDoctor({ target: 'claude', home: t.home, logger: silentLogger });
    assert.equal(hasError, false, 'user edit is not an error');
    assert.ok(checks.some((c) => c.level === 'warn' && c.message.includes('modified since install')));
  } finally {
    t.cleanup();
  }
});

test('init: detects package manager, framework, TS, and only real scripts', () => {
  const t = makeTempHome();
  try {
    t.write('pnpm-lock.yaml', '');
    t.write('tsconfig.json', '{}');
    t.writeJson('package.json', {
      dependencies: { next: '15', react: '18' },
      devDependencies: { typescript: '5' },
      scripts: { lint: 'eslint .', build: 'next build' },
    });
    const info = detectProject(t.home);
    assert.equal(info.packageManager, 'pnpm');
    assert.equal(info.framework, 'Next.js');
    assert.equal(info.typescript, true);
    assert.equal(info.scripts.lint, 'run lint');
    assert.equal(info.scripts.build, 'run build');
    assert.equal(info.scripts.typecheck, null, 'absent script not invented');
  } finally {
    t.cleanup();
  }
});

test('init: writes CLAUDE.md + AGENTS.md and does not overwrite without --force', () => {
  const t = makeTempHome();
  try {
    t.writeJson('package.json', { scripts: {} });
    runInit({ dir: t.home, logger: silentLogger });
    assert.ok(t.exists('CLAUDE.md') && t.exists('AGENTS.md'));
    t.write('CLAUDE.md', 'MINE');
    runInit({ dir: t.home, logger: silentLogger }); // no force
    assert.equal(t.read('CLAUDE.md'), 'MINE', 'existing file preserved');
    runInit({ dir: t.home, force: true, logger: silentLogger });
    assert.ok(t.read('CLAUDE.md').includes('프로젝트 지침'), 'force overwrites');
  } finally {
    t.cleanup();
  }
});
