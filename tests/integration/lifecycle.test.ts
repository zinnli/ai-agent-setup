import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import TOML from '@iarna/toml';
import { runInstall } from '../../src/commands/install.js';
import { runUninstall } from '../../src/commands/uninstall.js';
import { runDiff } from '../../src/commands/diff.js';
import { computeStatus } from '../../src/commands/status.js';
import { computeDoctor } from '../../src/commands/doctor.js';
import { makeTempHome, silentLogger } from '../helpers/temp-home.js';

const opts = (home: string, extra: Record<string, unknown> = {}) => ({ target: 'all', home, logger: silentLogger, ...extra });

/**
 * One ordered lifecycle over a temp HOME (never the real one): pre-seed user
 * config → dry-run → install → status/doctor/diff → reinstall no-op → user edits
 * (managed + structurally-merged) → force → uninstall → restore. Asserts state at
 * each step. Complements the focused per-behavior tests in install.test.ts.
 */
test('full lifecycle on a temp HOME preserves user config and restores on uninstall', () => {
  const t = makeTempHome();
  try {
    // Pre-seed user-owned config in both tools' merge targets.
    t.writeJson('.claude/settings.json', { permissions: { allow: ['Bash(ls:*)'] } });
    t.writeJson('.claude.json', { numStartups: 7, mcpServers: { usersrv: { command: 'mine' } } });
    t.write('.codex/config.toml', 'model = "gpt-5-codex"\n\n[mcp_servers.usersrv]\ncommand = "mine"\n');
    t.writeJson('.codex/hooks.json', { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'user-stop.sh' }] }] } });

    // 1. dry-run writes nothing.
    runInstall(opts(t.home, { dryRun: true }));
    assert.ok(!t.exists('.claude/CLAUDE.md'), 'dry-run leaves HOME clean');
    assert.ok(!t.exists('.claude/.ai-agent-setup/manifest.json'));
    assert.ok(!t.exists('.codex/AGENTS.md'));

    // 2. real install into the temp HOME (both tools).
    runInstall(opts(t.home));
    assert.ok(t.exists('.claude/CLAUDE.md') && t.exists('.codex/AGENTS.md'));
    assert.ok(t.exists('.agents/skills/review-diff/SKILL.md'), 'codex skills at ~/.agents/skills');
    assert.ok(t.exists('.claude/.ai-agent-setup/manifest.json') && t.exists('.codex/.ai-agent-setup/manifest.json'));

    // 3. status: installed, idempotent, no drift.
    for (const a of computeStatus(opts(t.home)).adapters) {
      assert.equal(a.installed, true);
      assert.equal(a.pendingChanges, 0);
      assert.equal(a.missing, 0);
      assert.equal(a.modified, 0);
    }

    // 4. doctor: no errors (env-not-set / CLI-not-found are warnings only).
    assert.equal(computeDoctor(opts(t.home)).hasError, false);

    // 5. diff after install: everything unchanged.
    for (const r of runDiff(opts(t.home))) assert.ok(r.items.every((i) => i.status === 'UNCHANGED'));

    // 6. reinstall is a no-op.
    for (const r of runInstall(opts(t.home))) assert.ok(r.items.every((i) => i.status === 'UNCHANGED'));

    // 7. user edits a fully-managed file → normal update preserves it.
    t.write('.claude/CLAUDE.md', t.read('.claude/CLAUDE.md') + '\nUSER EDIT\n');
    runInstall(opts(t.home));
    assert.ok(t.read('.claude/CLAUDE.md').includes('USER EDIT'), 'managed user edit preserved without --force');

    // 8. --force overwrites it, backing the user version up first.
    runInstall(opts(t.home, { force: true }));
    assert.ok(!t.read('.claude/CLAUDE.md').includes('USER EDIT'), 'force overwrote');
    assert.ok(existsSync(path.join(t.home, '.claude/.ai-agent-setup/backups')), 'backup dir exists');

    // 9. user edits a structurally-merged value → preserved across update.
    const j = t.readJson('.claude.json');
    j.mcpServers.usersrv.command = 'edited-by-user';
    t.writeJson('.claude.json', j);
    runInstall(opts(t.home));
    assert.equal(t.readJson('.claude.json').mcpServers.usersrv.command, 'edited-by-user', 'user merge value preserved');

    // 10. uninstall restores everything user-owned and removes only ours.
    runUninstall(opts(t.home));
    assert.deepEqual(t.readJson('.claude/settings.json'), { permissions: { allow: ['Bash(ls:*)'] } }, 'settings restored');
    const claudeJson = t.readJson('.claude.json');
    assert.equal(claudeJson.numStartups, 7);
    assert.ok(claudeJson.mcpServers.usersrv && !claudeJson.mcpServers.notion, 'only our MCP server removed');
    const cfg = TOML.parse(t.read('.codex/config.toml')) as any;
    assert.equal(cfg.model, 'gpt-5-codex');
    assert.ok(cfg.mcp_servers.usersrv && !cfg.mcp_servers.notion, 'codex user server kept, ours removed');
    const codexHooks = t.readJson('.codex/hooks.json');
    const stopCmds = codexHooks.hooks.Stop.flatMap((e: any) => e.hooks.map((h: any) => h.command));
    assert.ok(stopCmds.includes('user-stop.sh') && !stopCmds.some((c: string) => c.includes('CODEX_HOME')), 'user hook kept, ours removed');

    // 11. managed files gone, manifests cleaned up.
    assert.ok(!t.exists('.claude/CLAUDE.md') && !t.exists('.codex/AGENTS.md'));
    assert.ok(!t.exists('.claude/.ai-agent-setup/manifest.json') && !t.exists('.codex/.ai-agent-setup/manifest.json'));

    // 12. everything happened under the temp HOME (real HOME never targeted).
    assert.ok(t.home.startsWith(os.tmpdir()), 'operated only under a temp HOME');
  } finally {
    t.cleanup();
  }
});
