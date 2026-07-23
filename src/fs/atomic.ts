import { mkdirSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import path from 'node:path';

/**
 * Write a file durably: create parent dirs, write to a temp sibling, then rename
 * into place (atomic within a filesystem). A crash mid-write never leaves a
 * partially written target — the old file stays until the rename succeeds.
 */
export function atomicWrite(absPath: string, content: string, mode = 0o644): void {
  const dir = path.dirname(absPath);
  mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(absPath)}.aas-tmp-${process.pid}-${Date.now()}`);
  writeFileSync(tmp, content, { mode });
  chmodSync(tmp, mode);
  renameSync(tmp, absPath);
}
