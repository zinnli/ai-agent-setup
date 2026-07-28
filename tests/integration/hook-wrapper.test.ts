import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { loadCore } from '../../loader/load.js';
import { renderHooks } from '../../adapters/claude/hooks.js';
import { projectRoot } from '../helpers/paths.js';

/**
 * Materialize the real core's hook scripts + wrappers into a throwaway temp dir
 * (system temp, never HOME) and exercise the JSON-stdin -> exit-code bridge.
 */
function materializeHooks(): { dir: string; cleanup: () => void } {
  const { core } = loadCore(path.join(projectRoot, 'core'));
  const files = renderHooks(core);
  const home = mkdtempSync(path.join(os.tmpdir(), 'aas-hooks-'));
  for (const f of files) {
    if (!f.relativePath.startsWith('hooks/')) continue;
    const abs = path.join(home, '.claude', f.relativePath);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, f.content);
    if (f.mode) chmodSync(abs, f.mode);
  }
  return { dir: path.join(home, '.claude', 'hooks'), cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

function run(wrapper: string, input: string, cwd?: string) {
  const res = spawnSync('bash', [wrapper], { input, encoding: 'utf8', cwd });
  return { code: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const hooks = materializeHooks();
const secrets = path.join(hooks.dir, 'protect-secrets.wrapper.sh');
const destructive = path.join(hooks.dir, 'block-destructive-command.wrapper.sh');
const format = path.join(hooks.dir, 'format-changed-files.wrapper.sh');
const validate = path.join(hooks.dir, 'validate-before-finish.wrapper.sh');

test.after(() => hooks.cleanup());

test('protect-secrets: file tools reading a secret are blocked (exit 2)', () => {
  for (const tool of ['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
    const field = tool === 'NotebookEdit' ? 'notebook_path' : 'file_path';
    const input = JSON.stringify({ tool_name: tool, tool_input: { [field]: '/p/.env' } });
    assert.equal(run(secrets, input).code, 2, `${tool} secret access should block`);
  }
});

test('protect-secrets: secret access via Bash is blocked (exit 2)', () => {
  const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'cat ~/.ssh/id_rsa' } });
  assert.equal(run(secrets, input).code, 2);
});

test('protect-secrets: ordinary file access is allowed (exit 0)', () => {
  const input = JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/p/src/index.ts' } });
  assert.equal(run(secrets, input).code, 0);
});

test('block-destructive: ordinary Bash allowed, destructive blocked', () => {
  assert.equal(run(destructive, JSON.stringify({ tool_input: { command: 'ls -la' } })).code, 0);
  assert.equal(run(destructive, JSON.stringify({ tool_input: { command: 'rm -rf build' } })).code, 2);
});

test('wrapper fails safe on malformed JSON input (allows, exit 0, no crash)', () => {
  const r = run(secrets, 'this is not json at all');
  assert.equal(r.code, 0, 'malformed input must not block');
});

test('wrapper fails safe when tool_input / fields are missing', () => {
  assert.equal(run(secrets, '{}').code, 0);
  assert.equal(run(secrets, JSON.stringify({ tool_name: 'Read', tool_input: {} })).code, 0);
});

test('malformed input does not echo secret-looking content into logs', () => {
  const r = run(secrets, 'garbage-not-json');
  assert.ok(!r.stdout.includes('garbage-not-json'), 'stdout leaks nothing');
});

test('non-blocking format hook never returns a blocking exit code', () => {
  // Run in the temp hooks dir (a git repo may or may not exist); must exit 0 regardless.
  const r = run(format, JSON.stringify({ tool_input: { file_path: '/p/x.ts' } }), os.tmpdir());
  assert.equal(r.code, 0);
});

test('Stop hook does not accidentally block (no infinite stop loop) outside a project', () => {
  // validate-before-finish exits 0 when there is no git worktree / package.json,
  // so the wrapper must exit 0 and NOT block the Stop (which would loop).
  const nonRepo = mkdtempSync(path.join(os.tmpdir(), 'aas-nonrepo-'));
  try {
    const r = run(validate, JSON.stringify({ hook_event_name: 'Stop' }), nonRepo);
    assert.equal(r.code, 0, 'Stop hook must not block when there is nothing to validate');
  } finally {
    rmSync(nonRepo, { recursive: true, force: true });
  }
});
