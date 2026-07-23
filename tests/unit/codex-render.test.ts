import { test } from 'node:test';
import assert from 'node:assert/strict';
import TOML from '@iarna/toml';
import { mapCodexEvent } from '../../src/adapters/codex/event-map.js';
import { renderMcp } from '../../src/adapters/codex/mcp.js';
import { renderHooks } from '../../src/adapters/codex/hooks.js';
import { renderAgents } from '../../src/adapters/codex/agents.js';
import { codexAdapter } from '../../src/adapters/codex/index.js';
import type { CoreModel, Hook } from '../../src/core/model.js';
import { loadCore } from '../../src/core/load.js';
import { minimalCore } from '../helpers/paths.js';

function base(): CoreModel {
  return { instructions: [], agents: [], skills: [], hooks: [], mcpServers: [] };
}

test('codex adapter roots: ~/.codex install, ~/.agents/skills for skills', () => {
  assert.ok(codexAdapter.installRoot('/H').endsWith('/.codex'));
  assert.ok(codexAdapter.skillsRoot('/H').endsWith('/.agents/skills'));
});

test('codex event-map: PreToolUse/PostToolUse/Stop with matchers omitted', () => {
  const mk = (trigger: Hook['trigger']): Hook => ({ id: 't', scriptFile: '/c/hooks/t.sh', trigger, blocking: true, targets: [] });
  assert.equal(mapCodexEvent(mk('before-command')).event, 'PreToolUse');
  assert.equal(mapCodexEvent(mk('before-command')).matcher, undefined, 'no matcher assumed');
  assert.equal(mapCodexEvent(mk('after-file-change')).event, 'PostToolUse');
  assert.equal(mapCodexEvent(mk('before-finish')).event, 'Stop');
});

test('codex mcp: TOML fragment under mcp_servers.<id>, disabled omitted, ${VAR} preserved', () => {
  const core = base();
  core.mcpServers = [
    { name: 'on', enabled: true, transport: 'stdio', command: 'npx', args: ['x'], env: { TOK: '${TOK}' }, sourceFile: 's.yaml' },
    { name: 'off', enabled: false, transport: 'stdio', command: 'npx', args: [], env: {}, sourceFile: 's.yaml' },
  ];
  const file = renderMcp(core)[0]!;
  assert.equal(file.relativePath, 'config.toml');
  assert.equal(file.format, 'toml');
  assert.equal(file.mergeStrategy, 'replace-keys');
  assert.deepEqual(file.managedPaths, ['mcp_servers.on']);
  const parsed = TOML.parse(file.content) as any;
  assert.ok(parsed.mcp_servers.on, 'enabled server present');
  assert.equal(parsed.mcp_servers.off, undefined, 'disabled omitted');
  assert.equal(parsed.mcp_servers.on.env.TOK, '${TOK}', 'var ref preserved literally');
});

test('codex hooks.json: top-level event keys, append-array, CODEX_HOME command', () => {
  const { core } = loadCore(minimalCore); // guard: before-command
  const files = renderHooks(core);
  const hooksJson = files.find((f) => f.relativePath === 'hooks.json')!;
  assert.equal(hooksJson.managed, false);
  assert.equal(hooksJson.mergeStrategy, 'append-array');
  const parsed = JSON.parse(hooksJson.content);
  assert.ok(parsed.PreToolUse, 'event is a TOP-LEVEL key (not nested under hooks)');
  assert.equal(parsed.hooks, undefined, 'not wrapped in a hooks object');
  const command: string = parsed.PreToolUse[0].hooks[0].command;
  assert.ok(command.includes('${CODEX_HOME:-$HOME/.codex}'), 'uses CODEX_HOME');
  assert.ok(!/\/Users\/|\/home\//.test(command), 'no build-time HOME baked in');
  assert.deepEqual(hooksJson.managedPaths, ['PreToolUse']);
});

test('codex agents: TOML with name/description/developer_instructions; mode as behavior', () => {
  const { core } = loadCore(minimalCore);
  const file = renderAgents(core).find((f) => f.relativePath === 'agents/demo-agent.toml')!;
  assert.ok(file.managed);
  const parsed = TOML.parse(file.content.replace(/^#.*$/gm, '')) as any;
  assert.equal(parsed.name, 'demo-agent');
  assert.ok(typeof parsed.developer_instructions === 'string');
  assert.ok(parsed.developer_instructions.includes('작업 제한'), 'read-only rendered as behavior');
  assert.equal(parsed.model, undefined, 'no invented model field');
});

test('codex compatibility: individual notes recorded, never whole-category', () => {
  const { core } = loadCore(minimalCore);
  const { unsupported } = codexAdapter.render(core);
  const cats = unsupported.map((u) => `${u.category}${u.field ? '.' + u.field : ''}`);
  assert.ok(cats.includes('hooks.tool_input'));
  assert.ok(cats.includes('hooks.matcher'));
  assert.ok(cats.includes('mcp.env'));
  // Notes are field-scoped, not "skills unsupported" / "hooks unsupported".
  assert.ok(!unsupported.some((u) => /unsupported/i.test(u.reason) && !u.field));
});
