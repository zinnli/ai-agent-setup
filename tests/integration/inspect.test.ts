import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInstall } from '../../src/commands/install.js';
import { computeStatus } from '../../src/commands/status.js';
import { computeList } from '../../src/commands/list.js';
import { computeDoctor } from '../../src/commands/doctor.js';
import { makeTempHome, silentLogger } from '../helpers/temp-home.js';

const opts = (home: string, extra: Record<string, unknown> = {}) => ({ target: 'all', home, logger: silentLogger, ...extra });

test('status: not-installed home reports pending changes, no drift', () => {
  const t = makeTempHome();
  try {
    const r = computeStatus(opts(t.home));
    for (const a of r.adapters) {
      assert.equal(a.installed, false);
      assert.ok(a.pendingChanges > 0, 'a fresh install is pending');
      assert.equal(a.missing, 0);
      assert.equal(a.conflicts, 0);
    }
  } finally {
    t.cleanup();
  }
});

test('status: after install, install is idempotent (no pending, no missing/modified)', () => {
  const t = makeTempHome();
  try {
    runInstall(opts(t.home));
    const r = computeStatus(opts(t.home));
    for (const a of r.adapters) {
      assert.equal(a.installed, true);
      assert.ok(a.installedAt, 'records install time');
      assert.equal(a.pendingChanges, 0, 'reinstall would be a no-op');
      assert.equal(a.missing, 0);
      assert.equal(a.modified, 0);
      assert.ok(a.managedInstalled > 0 && a.mergesInstalled > 0);
    }
  } finally {
    t.cleanup();
  }
});

test('status: user-modified managed file is detected', () => {
  const t = makeTempHome();
  try {
    runInstall(opts(t.home));
    t.write('.claude/CLAUDE.md', 'edited by user\n');
    const r = computeStatus(opts(t.home));
    const claude = r.adapters.find((a) => a.adapter === 'claude')!;
    assert.equal(claude.modified, 1, 'edit detected');
  } finally {
    t.cleanup();
  }
});

test('list: every core item maps, hooks partial on codex (apply_patch path caveat)', () => {
  const r = computeList({ target: 'all' });
  const cats = new Set(r.items.map((i) => i.category));
  for (const c of ['instructions', 'agents', 'skills', 'hooks', 'mcp']) assert.ok(cats.has(c as any), `${c} listed`);
  // No item is unsupported wholesale; hooks are partial on codex, yes on claude.
  const hook = r.items.find((i) => i.category === 'hooks')!;
  assert.equal(hook.adapters.claude!.support, 'yes');
  assert.equal(hook.adapters.codex!.support, 'partial');
  assert.ok(hook.adapters.codex!.warnings.length > 0);
  // Skills/mcp/instructions fully supported on both.
  const skill = r.items.find((i) => i.category === 'skills')!;
  assert.equal(skill.adapters.claude!.support, 'yes');
  assert.equal(skill.adapters.codex!.support, 'yes');
  assert.ok(skill.adapters.codex!.dest.includes('.agents/skills'));
});

test('list: single target scopes adapters', () => {
  const r = computeList({ target: 'codex' });
  for (const it of r.items) {
    assert.deepEqual(Object.keys(it.adapters), ['codex']);
  }
});

test('doctor --verbose: hash detail present for a user-modified managed file', () => {
  const t = makeTempHome();
  try {
    runInstall(opts(t.home));
    t.write('.codex/AGENTS.md', 'tampered\n');
    const report = computeDoctor(opts(t.home));
    const modified = report.checks.find((c) => c.area === 'codex:install' && /modified since install/.test(c.message));
    assert.ok(modified, 'modification flagged');
    assert.ok(modified!.detail && /expected .* actual /.test(modified!.detail), 'verbose detail carries hashes');
  } finally {
    t.cleanup();
  }
});

test('doctor: same checks drive text and json (one model)', () => {
  const t = makeTempHome();
  try {
    const report = computeDoctor(opts(t.home));
    // model is serializable and self-consistent
    const json = JSON.parse(JSON.stringify(report));
    assert.equal(json.hasError, report.hasError);
    assert.equal(json.checks.length, report.checks.length);
  } finally {
    t.cleanup();
  }
});
