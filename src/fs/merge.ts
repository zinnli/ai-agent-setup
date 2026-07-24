import type { GeneratedFile } from '../adapters/types.js';
import type { MergeEntry } from './manifest.js';
import { getPath, setPath, deletePath, type Json } from '../util/objpath.js';
import { stableStringify } from '../util/json.js';
import { sha256 } from '../util/hash.js';

export interface MergeConflict {
  path: string;
  reason: string;
}

export interface MergeApply {
  merged: Json;
  installedHashes?: Record<string, string>;
  managedItems?: string[];
  conflicts: MergeConflict[];
  changed: boolean;
}

const valueHash = (v: unknown): string => sha256(stableStringify(v));

/** Identity signature of a hook array entry we own (its wrapper command), else null. */
export function hookEntrySignature(entry: unknown): string | null {
  if (entry == null || typeof entry !== 'object') return null;
  const hooks = (entry as Json).hooks;
  if (!Array.isArray(hooks)) return null;
  for (const h of hooks) {
    const cmd = h && typeof h === 'object' ? (h as Json).command : undefined;
    if (typeof cmd === 'string' && /\/hooks\/[^"']+\.wrapper\.sh"?$/.test(cmd)) return cmd;
  }
  return null;
}

/**
 * Merge a parsed fragment into existing parsed config, preserving all foreign
 * content. Both `existing` and `fragment` are plain objects (already parsed from
 * JSON or TOML by the caller), so this logic is serialization-agnostic. `prev` is
 * the manifest entry from a previous install (enables safe updates and conflict
 * detection). Returns the merged object plus what to record in the manifest.
 */
export function applyMerge(
  existing: Json,
  fragment: Json,
  file: GeneratedFile,
  prev: MergeEntry | undefined,
  force: boolean,
): MergeApply {
  const merged: Json = structuredClone(existing);
  const before = stableStringify(existing);

  if (file.mergeStrategy === 'append-array') {
    const managedItems: string[] = [];
    for (const p of file.managedPaths ?? []) {
      const fragArr = (getPath(fragment, p) as unknown[]) ?? [];
      const existingArr = (getPath(merged, p) as unknown[]) ?? [];
      // Drop our previously-installed items (idempotent reinstall), keep user items.
      const kept = existingArr.filter((e) => hookEntrySignature(e) === null);
      setPath(merged, p, [...kept, ...fragArr]);
      for (const item of fragArr) {
        const sig = hookEntrySignature(item);
        if (sig) managedItems.push(sig);
      }
    }
    return { merged, managedItems, conflicts: [], changed: stableStringify(merged) !== before };
  }

  // replace-keys (default)
  const installedHashes: Record<string, string> = {};
  const conflicts: MergeConflict[] = [];
  for (const p of file.managedPaths ?? []) {
    const fragValue = getPath(fragment, p);
    const newHash = valueHash(fragValue);
    const existingValue = getPath(merged, p);

    if (existingValue === undefined) {
      setPath(merged, p, fragValue);
      installedHashes[p] = newHash;
      continue;
    }
    const existingHash = valueHash(existingValue);
    if (existingHash === newHash) {
      installedHashes[p] = newHash; // already correct; still ours
      continue;
    }
    const prevHash = prev?.installedHashes?.[p];
    if (prevHash && existingHash === prevHash) {
      setPath(merged, p, fragValue); // our old value, safe to update
      installedHashes[p] = newHash;
      continue;
    }
    // A foreign or user-modified value occupies this path.
    if (force) {
      setPath(merged, p, fragValue);
      installedHashes[p] = newHash;
    } else {
      conflicts.push({ path: p, reason: 'existing value differs and was not installed by ai-agent-setup' });
    }
  }
  return { merged, installedHashes, conflicts, changed: stableStringify(merged) !== before };
}

export interface MergeRemove {
  merged: Json;
  removed: string[];
  preserved: string[];
}

/** Remove our managed content from a merge target, preserving user content. */
export function removeMerge(existing: Json, entry: MergeEntry, force: boolean): MergeRemove {
  const merged: Json = structuredClone(existing);
  const removed: string[] = [];
  const preserved: string[] = [];

  if (entry.strategy === 'append-array') {
    const sigs = new Set(entry.managedItems ?? []);
    for (const p of entry.managedPaths) {
      const arr = getPath(merged, p) as unknown[] | undefined;
      if (!Array.isArray(arr)) continue;
      const kept = arr.filter((e) => {
        const sig = hookEntrySignature(e);
        return sig === null || !sigs.has(sig);
      });
      if (kept.length === 0) deletePath(merged, p);
      else setPath(merged, p, kept);
      removed.push(p);
    }
    return { merged, removed, preserved };
  }

  // replace-keys
  for (const p of entry.managedPaths) {
    const value = getPath(merged, p);
    if (value === undefined) continue;
    const installedHash = entry.installedHashes?.[p];
    if (installedHash && valueHash(value) === installedHash) {
      deletePath(merged, p);
      removed.push(p);
    } else if (force) {
      deletePath(merged, p);
      removed.push(p);
    } else {
      preserved.push(p); // user modified since install — leave it
    }
  }
  return { merged, removed, preserved };
}
