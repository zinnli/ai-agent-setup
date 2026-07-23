import path from 'node:path';
import type { Adapter, GeneratedFile } from '../adapters/types.js';

/**
 * Resolve a GeneratedFile to an absolute path under a given HOME. Files anchored
 * to 'skills' use the adapter's skillsRoot (which may live outside installRoot,
 * e.g. Codex ~/.agents/skills); everything else uses installRoot. `build` passes
 * a fake HOME (generated/<tool>) so the preview mirrors a real install exactly.
 */
export function resolveFilePath(adapter: Adapter, home: string, file: GeneratedFile): string {
  const base =
    file.root === 'skills'
      ? adapter.skillsRoot(home)
      : file.root === 'home'
        ? home
        : adapter.installRoot(home);
  return path.join(base, file.relativePath);
}
