import { test } from 'node:test';
import assert from 'node:assert/strict';
import TOML from '@iarna/toml';
import { mapCodexEvent } from '../../src/adapters/codex/event-map.js';
import { renderMcp } from '../../src/adapters/codex/mcp.js';
import { renderHooks } from '../../src/adapters/codex/hooks.js';
import { renderAgents } from '../../src/adapters/codex/agents.js';
import { codexAdapter } from '../../src/adapters/codex/index.js';
import type { CoreModel, Hook } from '../../src/core/model.js';
import path from 'node:path';
import { loadCore } from '../../src/core/load.js';
import { minimalCore, projectRoot } from '../helpers/paths.js';

function base(): CoreModel {
  return { instructions: [], agents: [], skills: [], hooks: [], mcpServers: [] };
}

test('codex adapter roots: ~/.codex install, ~/.agents/skills for skills', () => {
  assert.ok(codexAdapter.installRoot('/H').endsWith('/.codex'));
  assert.ok(codexAdapter.skillsRoot('/H').endsWith('/.agents/skills'));
});

test('codex event-map: verified events + tool-name matchers', () => {
  const mk = (trigger: Hook['trigger']): Hook => ({ id: 't', scriptFile: '/c/hooks/t.sh', trigger, blocking: true, targets: [] });
  assert.equal(mapCodexEvent(mk('before-command')).event, 'PreToolUse');
  assert.equal(mapCodexEvent(mk('before-command')).matcher, 'Bash', 'shell matches Bash');
  assert.equal(mapCodexEvent(mk('before-file-access')).matcher, 'Bash|apply_patch|Edit|Write');
  assert.equal(mapCodexEvent(mk('after-file-change')).event, 'PostToolUse');
  assert.equal(mapCodexEvent(mk('after-file-change')).matcher, 'apply_patch|Edit|Write');
  assert.equal(mapCodexEvent(mk('before-finish')).event, 'Stop');
  assert.equal(mapCodexEvent(mk('before-finish')).matcher, undefined, 'Stop ignores matcher');
});

test('codex mcp: ${VAR} ref -> env_vars, literal -> env, disabled omitted', () => {
  const core = base();
  core.mcpServers = [
    { name: 'on', enabled: true, transport: 'stdio', command: 'npx', args: ['x'], env: { TOK: '${TOK}', REGION: 'us-east-1' }, sourceFile: 's.yaml' },
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
  assert.deepEqual(parsed.mcp_servers.on.env_vars, ['TOK'], 'ref forwarded via env_vars');
  assert.equal(parsed.mcp_servers.on.env.REGION, 'us-east-1', 'literal kept in env');
  // The secret var NAME may appear; its VALUE must never be written anywhere.
  assert.ok(!file.content.includes('${TOK}'), 'no unresolved placeholder written literally');
});

test('codex mcp: several ${VAR} refs forwarded stably; no secret value ever written', () => {
  const core = base();
  core.mcpServers = [
    { name: 's', enabled: true, transport: 'stdio', command: 'npx', args: [], env: { B_TOKEN: '${B_TOKEN}', A_KEY: '${A_KEY}' }, sourceFile: 's.yaml' },
  ];
  const content = renderMcp(core)[0]!.content;
  const parsed = TOML.parse(content) as any;
  assert.deepEqual(parsed.mcp_servers.s.env_vars, ['A_KEY', 'B_TOKEN'], 'sorted, stable');
  assert.equal(parsed.mcp_servers.s.env, undefined, 'no literal env when all are refs');
});

test('codex hooks.json: events nested under "hooks", matcher, append-array, CODEX_HOME', () => {
  const { core } = loadCore(minimalCore); // guard: before-command
  const files = renderHooks(core);
  const hooksJson = files.find((f) => f.relativePath === 'hooks.json')!;
  assert.equal(hooksJson.managed, false);
  assert.equal(hooksJson.mergeStrategy, 'append-array');
  const parsed = JSON.parse(hooksJson.content);
  assert.ok(parsed.hooks, 'events nested under a top-level "hooks" object (verified schema)');
  assert.ok(parsed.hooks.PreToolUse, 'PreToolUse under hooks');
  assert.equal(parsed.hooks.PreToolUse[0].matcher, 'Bash', 'matcher present');
  const command: string = parsed.hooks.PreToolUse[0].hooks[0].command;
  assert.ok(command.includes('${CODEX_HOME:-$HOME/.codex}'), 'uses CODEX_HOME');
  assert.ok(!/\/Users\/|\/home\//.test(command), 'no build-time HOME baked in');
  assert.deepEqual(hooksJson.managedPaths, ['hooks.PreToolUse']);
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

test('codex compatibility: only genuine per-field notes, never whole-category', () => {
  // Real core has file-access + after-file-change hooks (the apply_patch caveat).
  const { core } = loadCore(path.join(projectRoot, 'core'));
  const { unsupported } = codexAdapter.render(core);
  const cats = unsupported.map((u) => `${u.category}${u.field ? '.' + u.field : ''}`);
  // Verified-away warnings must NOT reappear.
  assert.ok(!cats.some((c) => c === 'instructions'), 'AGENTS.md path is confirmed');
  assert.ok(!cats.includes('hooks.matcher'), 'matchers are now emitted');
  assert.ok(!cats.includes('mcp.env'), 'env forwarding is confirmed via env_vars');
  // The one genuine limitation: apply_patch hides the path inside command text.
  assert.ok(cats.includes('hooks.tool_input.file_path'));
  // Notes are field-scoped, not "skills unsupported" / "hooks unsupported".
  assert.ok(!unsupported.some((u) => /unsupported/i.test(u.reason) && !u.field));
});

test('codex compatibility: minimal core (clean refs, no file hooks) has zero notes', () => {
  const { core } = loadCore(minimalCore);
  const { unsupported } = codexAdapter.render(core);
  assert.equal(unsupported.length, 0, 'nothing unsupported when everything maps natively');
});
