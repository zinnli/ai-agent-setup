import { readFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { sha256 } from '../util/hash.js';

/** sha256 of a file's contents, or null if it does not exist. */
export function fileHash(absPath: string): string | null {
  if (!existsSync(absPath)) return null;
  return sha256(readFileSync(absPath));
}

/**
 * Copy an existing file into the tool's backup area before it is displaced.
 * Backups are grouped under a per-run timestamp dir and mirror the file's
 * HOME-relative layout, so names never collide. Returns the HOME-relative
 * backup path (for the manifest). The copy is verified before the caller
 * proceeds to modify the original.
 */
export function backupFile(
  home: string,
  installRoot: string,
  absSource: string,
  session: string,
): string {
  const homeRel = path.relative(home, absSource);
  const backupAbs = path.join(installRoot, '.ai-agent-setup', 'backups', session, homeRel);
  mkdirSync(path.dirname(backupAbs), { recursive: true });
  copyFileSync(absSource, backupAbs);
  if (fileHash(backupAbs) !== fileHash(absSource)) {
    throw new Error(`Backup verification failed for ${absSource}`);
  }
  return path.relative(home, backupAbs);
}

/** A filesystem-safe timestamp for grouping one run's backups. */
export function backupSession(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
