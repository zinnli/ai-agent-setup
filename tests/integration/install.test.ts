import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { runInstall, installAdapter } from '../../commands/install.js';
import { runUninstall } from '../../commands/uninstall.js';
import { runDiff } from '../../commands/diff.js';
import { claudeAdapter } from '../../adapters/claude/index.js';
import { renderAll } from '../../adapters/render-all.js';
import { makeTempHome, silentLogger } from '../helpers/temp-home.js';

const opts = (home: string, extra: Record<string, unknown> = {}) => ({
  target: 'claude',
  home,
  logger: silentLogger,
  ...extra,
});

test('1. install into empty HOME lands all files + manifest', () => {
  const t = makeTempHome();
  try {
    runInstall(opts(t.home));
    assert.ok(t.exists('.claude/CLAUDE.md'));
    assert.ok(t.exists('.claude/skills/review-diff/SKILL.md'));
    assert.ok(t.exists('.claude.json'));
    assert.ok(t.exists('.claude/.ai-agent-setup/manifest.json'));
  } finally {
    t.cleanup();
  }
});

test('2 & 14. existing settings.json: user keys preserved, our hooks appended', () => {
  const t = makeTempHome();
  try {
    t.writeJson('.claude/settings.json', {
      permissions: { allow: ['Bash(ls:*)'] },
      hooks: { PreToolUse: [{ matcher: 'WebFetch', hooks: [{ type: 'command', command: 'mine.sh' }] }] },
    });
    runInstall(opts(t.home));
    const s = t.readJson('.claude/settings.json');
    assert.deepEqual(s.permissions.allow, ['Bash(ls:*)'], 'user permissions preserved');
    const matchers = s.hooks.PreToolUse.map((e: any) => e.matcher);
    assert.ok(matchers.includes('WebFetch'), 'user hook preserved');
    assert.ok(matchers.includes('Bash'), 'our hook appended');
  } finally {
    t.cleanup();
  }
});

test('4 & 15. existing ~/.claude.json MCP servers preserved, ours added', () => {
  const t = makeTempHome();
  try {
    t.writeJson('.claude.json', { numStartups: 42, mcpServers: { myserver: { command: 'foo' } } });
    runInstall(opts(t.home));
    const j = t.readJson('.claude.json');
    assert.equal(j.numStartups, 42, 'unrelated key preserved');
    assert.ok(j.mcpServers.myserver, 'user server preserved');
    assert.ok(j.mcpServers.notion, 'our server added');
  } finally {
    t.cleanup();
  }
});

test('5. same-name MCP server with a different definition is a conflict (not clobbered)', () => {
  const t = makeTempHome();
  try {
    t.writeJson('.claude.json', { mcpServers: { notion: { command: 'user-custom' } } });
    const res = runInstall(opts(t.home));
    const items = res[0]!.items;
    assert.ok(items.some((i) => i.status === 'CONFLICT'), 'conflict reported');
    const j = t.readJson('.claude.json');
    assert.equal(j.mcpServers.notion.command, 'user-custom', 'user definition NOT overwritten');
  } finally {
    t.cleanup();
  }
});

test('5b. --force overwrites a conflicting MCP server', () => {
  const t = makeTempHome();
  try {
    t.writeJson('.claude.json', { mcpServers: { notion: { command: 'user-custom' } } });
    runInstall(opts(t.home, { force: true }));
    const j = t.readJson('.claude.json');
    assert.equal(j.mcpServers.notion.command, 'npx', 'force overwrites to our definition');
  } finally {
    t.cleanup();
  }
});

test('6. reinstall identical output is a no-op (all unchanged)', () => {
  const t = makeTempHome();
  try {
    runInstall(opts(t.home));
    const res = runInstall(opts(t.home));
    const items = res[0]!.items;
    assert.ok(items.every((i) => i.status === 'UNCHANGED'), 'nothing changes on reinstall');
  } finally {
    t.cleanup();
  }
});

test('7. update restores a managed file the user truncated (with --force)', () => {
  const t = makeTempHome();
  try {
    runInstall(opts(t.home));
    chmodSync(path.join(t.home, '.claude/CLAUDE.md'), 0o644);
    t.write('.claude/CLAUDE.md', ''); // user truncated it
    const res = runInstall(opts(t.home, { force: true }));
    assert.ok(res[0]!.items.some((i) => i.path.endsWith('CLAUDE.md') && i.status === 'UPDATED'));
    assert.ok(t.read('.claude/CLAUDE.md').includes('기본 행동 규칙'), 'content regenerated');
  } finally {
    t.cleanup();
  }
});

test('8 & 9. user-modified managed file: detected and preserved on normal update', () => {
  const t = makeTempHome();
  try {
    runInstall(opts(t.home));
    t.write('.claude/CLAUDE.md', t.read('.claude/CLAUDE.md') + '\nUSER EDIT\n');
    const diff = runDiff(opts(t.home));
    assert.ok(diff[0]!.items.some((i) => i.status === 'USER_MODIFIED' && i.path.endsWith('CLAUDE.md')));
    runInstall(opts(t.home)); // normal update
    assert.ok(t.read('.claude/CLAUDE.md').includes('USER EDIT'), 'user edit preserved');
  } finally {
    t.cleanup();
  }
});

test('10. --force overwrites a user-modified managed file after backing it up', () => {
  const t = makeTempHome();
  try {
    runInstall(opts(t.home));
    t.write('.claude/CLAUDE.md', 'USER VERSION');
    runInstall(opts(t.home, { force: true }));
    assert.ok(!t.read('.claude/CLAUDE.md').includes('USER VERSION'), 'overwritten');
    const backups = readdirSync(path.join(t.home, '.claude/.ai-agent-setup/backups'), { recursive: true }) as string[];
    assert.ok(backups.some((b) => String(b).endsWith('CLAUDE.md')), 'user version backed up');
  } finally {
    t.cleanup();
  }
});

test('11. uninstall from an empty HOME does nothing gracefully', () => {
  const t = makeTempHome();
  try {
    const res = runUninstall(opts(t.home));
    assert.deepEqual(res[0]!.items, []);
  } finally {
    t.cleanup();
  }
});

test('12 & 13. uninstall restores pre-existing files and removes only managed paths', () => {
  const t = makeTempHome();
  try {
    t.writeJson('.claude/settings.json', { permissions: { allow: ['X'] } });
    t.writeJson('.claude.json', { numStartups: 1, mcpServers: { mine: { command: 'x' } } });
    runInstall(opts(t.home));
    runUninstall(opts(t.home));
    assert.deepEqual(t.readJson('.claude/settings.json'), { permissions: { allow: ['X'] } }, 'settings restored');
    const j = t.readJson('.claude.json');
    assert.equal(j.numStartups, 1);
    assert.ok(j.mcpServers.mine && !j.mcpServers.notion, 'only our server removed');
    assert.ok(!t.exists('.claude/CLAUDE.md'), 'managed files removed');
  } finally {
    t.cleanup();
  }
});

test('17. malformed target JSON is skipped safely (not corrupted)', () => {
  const t = makeTempHome();
  try {
    t.write('.claude/settings.json', '{ this is not json');
    const res = runInstall(opts(t.home));
    assert.ok(res[0]!.items.some((i) => i.path.endsWith('settings.json') && i.status === 'CONFLICT'));
    assert.equal(t.read('.claude/settings.json'), '{ this is not json', 'left untouched');
  } finally {
    t.cleanup();
  }
});

test('21. --dry-run writes nothing to HOME', () => {
  const t = makeTempHome();
  try {
    runInstall(opts(t.home, { dryRun: true }));
    assert.ok(!t.exists('.claude/CLAUDE.md'), 'no managed file written');
    assert.ok(!t.exists('.claude/.ai-agent-setup/manifest.json'), 'no manifest written');
  } finally {
    t.cleanup();
  }
});

test('orphan cleanup: a file no longer produced is removed on update', () => {
  const t = makeTempHome();
  try {
    // First install a render with an extra managed file, then install the real render.
    const { builds } = renderAll('claude');
    const real = builds[0]!.result;
    const withExtra = {
      files: [
        ...real.files,
        { relativePath: 'agents/ghost.md', content: 'ghost\n', sourceFiles: [], managed: true as const },
      ],
      unsupported: real.unsupported,
    };
    installAdapter(claudeAdapter, withExtra, t.home, { target: 'claude' }, silentLogger);
    assert.ok(t.exists('.claude/agents/ghost.md'));
    // Reinstall the real render (no ghost) — it should be treated as an orphan and removed.
    installAdapter(claudeAdapter, real, t.home, { target: 'claude' }, silentLogger);
    assert.ok(!t.exists('.claude/agents/ghost.md'), 'orphan removed');
  } finally {
    t.cleanup();
  }
});
