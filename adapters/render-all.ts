import type { CoreModel, Diagnostic } from '../loader/model.js';
import { loadCore } from '../loader/load.js';
import { coreDir as defaultCoreDir } from '../util/paths.js';
import { selectAdapters } from './registry.js';
import type { Adapter, RenderResult } from './types.js';

export interface AdapterBuild {
  adapter: Adapter;
  result: RenderResult;
}

export interface RenderAllResult {
  core: CoreModel;
  diagnostics: Diagnostic[];
  builds: AdapterBuild[];
}

/** Load + validate core once and render every selected adapter (no filesystem writes). */
export function renderAll(target: string, coreDir = defaultCoreDir()): RenderAllResult {
  const { core, diagnostics } = loadCore(coreDir);
  const builds: AdapterBuild[] = selectAdapters(target).map((adapter: Adapter) => ({
    adapter,
    result: adapter.render(core),
  }));
  return { core, diagnostics, builds };
}
