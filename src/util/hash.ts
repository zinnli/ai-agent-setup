import { createHash } from 'node:crypto';

/** sha256 of a string or buffer, prefixed "sha256:" for manifest storage. */
export function sha256(data: string | Buffer): string {
  return 'sha256:' + createHash('sha256').update(data).digest('hex');
}

/** Compare two hash strings (or undefined) for equality. */
export function hashEquals(a: string | undefined, b: string | undefined): boolean {
  return a !== undefined && a === b;
}
