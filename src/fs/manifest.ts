import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { atomicWrite } from './atomic.js';

/** A fully-owned file this tool installed. Paths are HOME-relative. */
export interface ManagedEntry {
  path: string;
  /** sha256 of the content we wrote (detects later user edits) */
  renderedHash: string;
  /** HOME-relative backup of the pre-existing file we displaced, or null */
  backup: string | null;
  /** repo-relative core sources */
  sourceFiles: string[];
}

/** A structural-merge target (settings.json, ~/.claude.json, config.toml…). */
export interface MergeEntry {
  path: string;
  strategy: 'replace-keys' | 'append-array';
  /** serialization of the target file (default "json") */
  format?: 'json' | 'toml';
  /** object paths we own, e.g. ["mcpServers.notion"] or ["hooks.PreToolUse"] */
  managedPaths: string[];
  /** replace-keys: managed path -> sha256 of the JSON value we installed */
  installedHashes?: Record<string, string>;
  /** append-array: identity signatures of the array items we appended */
  managedItems?: string[];
  /** HOME-relative backup of the original whole file (first touch), or null */
  backup: string | null;
  sourceFiles: string[];
}

export interface Manifest {
  tool: string;
  version: number;
  installedAt: string;
  managed: ManagedEntry[];
  merges: MergeEntry[];
}

export const MANIFEST_VERSION = 1;

/** Manifest path for a tool, inside its install root: <installRoot>/.ai-agent-setup/manifest.json */
export function manifestPath(installRoot: string): string {
  return path.join(installRoot, '.ai-agent-setup', 'manifest.json');
}

export function loadManifest(installRoot: string): Manifest | null {
  const p = manifestPath(installRoot);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Manifest;
  } catch {
    return null;
  }
}

export function saveManifest(installRoot: string, manifest: Manifest): void {
  atomicWrite(manifestPath(installRoot), JSON.stringify(manifest, null, 2) + '\n', 0o644);
}

export function emptyManifest(tool: string): Manifest {
  return { tool, version: MANIFEST_VERSION, installedAt: new Date().toISOString(), managed: [], merges: [] };
}

/** The directory (inside install root) that holds manifest + backups. */
export function metaDir(installRoot: string): string {
  return path.join(installRoot, '.ai-agent-setup');
}
