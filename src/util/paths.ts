import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the HOME directory to operate on. Every install/update/uninstall path
 * derives from this so tests (and dry runs) can point at a temp dir instead of
 * the real user HOME via --home. Never default silently to a destructive path.
 */
export function resolveHome(override?: string): string {
  const home = override ?? homedir();
  if (!home) {
    throw new Error('Could not resolve HOME directory. Pass --home explicitly.');
  }
  return path.resolve(home);
}

/** Repo root (…/ai-agent-setup), derived from this file's compiled location. */
export function repoRoot(): string {
  // compiled: <root>/dist/src/util/paths.js  -> up 4 to <root>
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..');
}

export function coreDir(root = repoRoot()): string {
  return path.join(root, 'core');
}

export function generatedDir(root = repoRoot()): string {
  return path.join(root, 'generated');
}

/** Display an absolute path relative to the repo root (for generated-file banners). */
export function repoRelative(abs: string, root = repoRoot()): string {
  const rel = path.relative(root, abs);
  return rel.startsWith('..') ? abs : rel;
}
