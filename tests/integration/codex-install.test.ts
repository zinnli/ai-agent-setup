import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import TOML from '@iarna/toml';
import { runInstall } from '../../src/commands/install.js';
import { runUninstall } from '../../src/commands/uninstall.js';
import { renderHooks } from '../../src/adapters/codex/hooks.js';
import { loadCore } from '../../src/core/load.js';
import { makeTempHome, silentLogger } from '../helpers/temp-home.js';
import { projectRoot } from '../helpers/paths.js';

const opts = (home: string, extra: Record<string, unknown> = {}) => ({
  target: 'codex',
  home,
  logger: silentLogger,
  ...extra,
});

test('codex install lands AGENTS.md, agents, skills (~/.agents/skills), config.toml, hooks.json', () => {
  const t = makeTempHome();
  try {
    runInstall(opts(t.home));
    assert.ok(t.exists('.codex/AGENTS.md'));
    assert.ok(t.exists('.codex/agents/reviewer.toml'));
    assert.ok(t.exists('.agents/skills/review-diff/SKILL.md'), 'skills at ~/.agents/skills');
    assert.ok(t.exists('.codex/config.toml'));
    assert.ok(t.exists('.codex/hooks.json'));
  } finally {
    t.cleanup();
  }
});

test('16. existing config.toml: unrelated TOML keys + user MCP server preserved', () => {
  const t = makeTempHome();
  try {
    t.write('.codex/config.toml', 'model = "gpt-5-codex"\n\n[mcp_servers.userserver]\ncommand = "mine"\n');
    runInstall(opts(t.home));
    const cfg = TOML.parse(t.read('.codex/config.toml')) as any;
    assert.equal(cfg.model, 'gpt-5-codex', 'unrelated key preserved');
    assert.ok(cfg.mcp_servers.userserver, 'user server preserved');
    assert.ok(cfg.mcp_servers.notion, 'our server added');
  } finally {
    t.cleanup();
  }
});

test('codex uninstall restores config.toml to the user original', () => {
  const t = makeTempHome();
  try {
    t.write('.codex/config.toml', 'model = "gpt-5-codex"\n\n[mcp_servers.userserver]\ncommand = "mine"\n');
    runInstall(opts(t.home));
    runUninstall(opts(t.home));
    const cfg = TOML.parse(t.read('.codex/config.toml')) as any;
    assert.equal(cfg.model, 'gpt-5-codex');
    assert.ok(cfg.mcp_servers.userserver && !cfg.mcp_servers.notion, 'only our server removed');
  } finally {
    t.cleanup();
  }
});

test('codex hooks.json merge preserves a user hook and appends ours', () => {
  const t = makeTempHome();
  try {
    t.writeJson('.codex/hooks.json', { hooks: { PreToolUse: [{ matcher: 'x', hooks: [{ type: 'command', command: 'mine.sh' }] }] } });
    runInstall(opts(t.home));
    const h = t.readJson('.codex/hooks.json');
    const commands = h.hooks.PreToolUse.flatMap((e: any) => e.hooks.map((x: any) => x.command));
    assert.ok(commands.includes('mine.sh'), 'user hook preserved');
    assert.ok(commands.some((c: string) => c.includes('CODEX_HOME')), 'our wrapper appended');
  } finally {
    t.cleanup();
  }
});

test('21b. codex --dry-run writes nothing', () => {
  const t = makeTempHome();
  try {
    runInstall(opts(t.home, { dryRun: true }));
    assert.ok(!t.exists('.codex/AGENTS.md'));
    assert.ok(!t.exists('.agents/skills/review-diff/SKILL.md'));
  } finally {
    t.cleanup();
  }
});

test('codex hook wrapper bridges JSON stdin -> exit 2 block / exit 0 allow', () => {
  const { core } = loadCore(path.join(projectRoot, 'core'));
  const files = renderHooks(core);
  const home = mkdtempSync(path.join(os.tmpdir(), 'aas-codex-hooks-'));
  try {
    for (const f of files) {
      if (!f.relativePath.startsWith('hooks/')) continue;
      const abs = path.join(home, '.codex', f.relativePath);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, f.content);
      if (f.mode) chmodSync(abs, f.mode);
    }
    const dir = path.join(home, '.codex', 'hooks');
    const run = (wrapper: string, input: string) =>
      spawnSync('bash', [path.join(dir, wrapper)], { input, encoding: 'utf8' }).status;

    // Codex delivers the shell command AND the apply_patch text in tool_input.command.
    assert.equal(run('protect-secrets.wrapper.sh', JSON.stringify({ tool_input: { command: 'cat /p/.env' } })), 2, 'blocks .env read');
    assert.equal(run('protect-secrets.wrapper.sh', JSON.stringify({ tool_input: { command: 'cat /p/a.ts' } })), 0, 'allows normal source');
    // apply_patch path is embedded in the patch text — the guard still catches it.
    assert.equal(run('protect-secrets.wrapper.sh', JSON.stringify({ tool_input: { command: '*** Begin Patch\n*** Update File: config/.env' } })), 2, 'blocks apply_patch touching .env');
    assert.equal(run('protect-secrets.wrapper.sh', JSON.stringify({ tool_input: { command: 'cat ~/.ssh/id_rsa' } })), 2, 'blocks ssh key');
    assert.equal(run('block-destructive-command.wrapper.sh', JSON.stringify({ tool_input: { command: 'rm -rf x' } })), 2, 'blocks destructive');
    assert.equal(run('block-destructive-command.wrapper.sh', JSON.stringify({ tool_input: { command: 'ls -la' } })), 0, 'allows normal command');
    assert.equal(run('protect-secrets.wrapper.sh', 'malformed'), 0, 'malformed JSON fails safe (no crash, no block)');
    assert.equal(run('protect-secrets.wrapper.sh', JSON.stringify({})), 0, 'missing tool_input does not crash');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
