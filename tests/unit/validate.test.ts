import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCore } from '../../src/core/validate.js';
import type { CoreModel } from '../../src/core/model.js';

function emptyCore(): CoreModel {
  return { instructions: [], agents: [], skills: [], hooks: [], mcpServers: [] };
}

function hasError(diags: ReturnType<typeof validateCore>, match: string): boolean {
  return diags.some((d) => d.level === 'error' && d.message.includes(match));
}
function hasWarn(diags: ReturnType<typeof validateCore>, match: string): boolean {
  return diags.some((d) => d.level === 'warn' && d.message.includes(match));
}

test('validate: agent referencing unknown skill is an error', () => {
  const core = emptyCore();
  core.agents = [
    { name: 'a', description: 'd', mode: 'read-only', skills: ['ghost'], instructions: [], sourceFile: 'a.yaml' },
  ];
  assert.ok(hasError(validateCore(core), 'unknown skill "ghost"'));
});

test('validate: skill name not matching folder is an error', () => {
  const core = emptyCore();
  core.skills = [
    { name: 'wrong', description: 'd', whenToUse: ['x'], notFor: [], inputs: [], outputs: [], related: [], body: 'b', resources: [], dir: '/core/skills/actual' },
  ];
  assert.ok(hasError(validateCore(core), 'does not match folder "actual"'));
});

test('validate: duplicate skill names are an error', () => {
  const core = emptyCore();
  const mk = (dir: string) => ({ name: 'dup', description: 'd', whenToUse: ['x'], notFor: [], inputs: [], outputs: [], related: [], body: 'b', resources: [], dir });
  core.skills = [mk('/core/skills/dup'), mk('/core/skills/dup')];
  assert.ok(hasError(validateCore(core), 'duplicate skill name "dup"'));
});

test('validate: unknown related skill is a warning, not an error', () => {
  const core = emptyCore();
  core.skills = [
    { name: 'demo', description: 'd', whenToUse: ['x'], notFor: [], inputs: [], outputs: [], related: ['nope'], body: 'b', resources: [], dir: '/core/skills/demo' },
  ];
  const diags = validateCore(core);
  assert.ok(hasWarn(diags, 'unknown skill "nope"'));
  assert.ok(!hasError(diags, 'nope'));
});

test('validate: literal (non-${VAR}) mcp env value warns of a possible secret', () => {
  const core = emptyCore();
  core.mcpServers = [
    { name: 's', enabled: true, transport: 'stdio', command: 'x', args: [], env: { TOKEN: 'sk-live-123' }, sourceFile: 'servers.yaml' },
  ];
  assert.ok(hasWarn(validateCore(core), 'possible literal secret'));
});

test('validate: malformed ${VAR} placeholder is an error, never stored literally', () => {
  const core = emptyCore();
  core.mcpServers = [
    { name: 's', enabled: true, transport: 'stdio', command: 'x', args: [], env: { TOK: '$NOTION_TOKEN' }, sourceFile: 'servers.yaml' },
  ];
  assert.ok(hasError(validateCore(core), 'malformed ${VAR} reference'));
});

test('validate: clean ${VAR} reference produces no mcp diagnostic', () => {
  const core = emptyCore();
  core.mcpServers = [
    { name: 's', enabled: true, transport: 'stdio', command: 'x', args: [], env: { NOTION_TOKEN: '${NOTION_TOKEN}' }, sourceFile: 'servers.yaml' },
  ];
  const diags = validateCore(core);
  assert.ok(!diags.some((d) => d.category === 'mcp'), 'a clean reference is fully supported');
});

test('validate: stdio server without command is an error', () => {
  const core = emptyCore();
  core.mcpServers = [
    { name: 's', enabled: true, transport: 'stdio', args: [], env: {}, sourceFile: 'servers.yaml' },
  ];
  assert.ok(hasError(validateCore(core), 'no command'));
});
