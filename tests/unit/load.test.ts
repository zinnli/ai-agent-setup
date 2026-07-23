import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from '../../src/core/load.js';
import { minimalCore } from '../helpers/paths.js';

test('loadCore: instruction ordering follows order.yaml, unlisted appended with warn', () => {
  const { core, diagnostics } = loadCore(minimalCore);
  assert.deepEqual(
    core.instructions.map((i) => i.id),
    ['base', 'safety', 'loose'],
  );
  assert.deepEqual(
    core.instructions.map((i) => i.order),
    [0, 1, 2],
  );
  const looseWarn = diagnostics.find(
    (d) => d.category === 'instructions' && d.message.includes('loose'),
  );
  assert.ok(looseWarn && looseWarn.level === 'warn', 'expected a warn for unlisted loose.md');
});

test('loadCore: agents parsed with skill cross-references', () => {
  const { core } = loadCore(minimalCore);
  assert.equal(core.agents.length, 1);
  const agent = core.agents[0]!;
  assert.equal(agent.name, 'demo-agent');
  assert.equal(agent.mode, 'read-only');
  assert.deepEqual(agent.skills, ['demo']);
});

test('loadCore: skills carry optional requires and resources', () => {
  const { core } = loadCore(minimalCore);
  const demo = core.skills.find((s) => s.name === 'demo')!;
  assert.deepEqual(demo.requires, ['demo CLI']);
  assert.deepEqual(demo.whenToUse, ['데모가 필요할 때']);
  assert.equal(demo.resources.length, 1);
  assert.equal(demo.resources[0]!.relPath, 'resources/note.md');
});

test('loadCore: hooks joined with manifest metadata', () => {
  const { core } = loadCore(minimalCore);
  assert.equal(core.hooks.length, 1);
  const guard = core.hooks[0]!;
  assert.equal(guard.id, 'guard');
  assert.equal(guard.trigger, 'before-command');
  assert.equal(guard.blocking, true);
  assert.deepEqual(guard.targets, ['command']);
});

test('loadCore: mcp servers flattened from servers.<name>', () => {
  const { core } = loadCore(minimalCore);
  assert.equal(core.mcpServers.length, 1);
  const demo = core.mcpServers[0]!;
  assert.equal(demo.name, 'demo');
  assert.equal(demo.enabled, true);
  assert.equal(demo.transport, 'stdio');
  assert.equal(demo.command, 'echo');
  assert.deepEqual(demo.env, { DEMO_TOKEN: '${DEMO_TOKEN}' });
});

test('loadCore: minimal fixture has no error-level diagnostics', () => {
  const { diagnostics } = loadCore(minimalCore);
  const errors = diagnostics.filter((d) => d.level === 'error');
  assert.deepEqual(errors, [], `unexpected errors: ${JSON.stringify(errors)}`);
});
