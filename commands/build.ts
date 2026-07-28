import { mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import path from 'node:path';
import type { CoreModel } from '../loader/model.js';
import { resolveFilePath } from '../fs/layout.js';
import { renderAll, type AdapterBuild } from '../adapters/render-all.js';
import { renderCompatibility } from '../adapters/shared/unsupported.js';
import { coreDir as defaultCoreDir, generatedDir as defaultGeneratedDir } from '../util/paths.js';
import { createLogger, reportDiagnostics, type Logger } from '../util/log.js';

export interface BuildOptions {
  target: string;
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
  coreDir?: string;
  generatedDir?: string;
  logger?: Logger;
}

export interface BuildOutput {
  core: CoreModel;
  builds: AdapterBuild[];
}

/**
 * Load + validate core, render each selected adapter, and (unless dryRun) mirror
 * the output under generated/<tool>/ as a fake HOME. Touches no real $HOME.
 */
export function runBuild(opts: BuildOptions): BuildOutput {
  const log = opts.logger ?? createLogger({ verbose: opts.verbose });
  const coreDir = opts.coreDir ?? defaultCoreDir();
  const genDir = opts.generatedDir ?? defaultGeneratedDir();

  const { core, diagnostics, builds } = renderAll(opts.target, coreDir);
  const hasError = reportDiagnostics(diagnostics, log);
  if (hasError && !opts.force) {
    throw new Error('core validation failed. Fix the errors above or pass --force.');
  }

  for (const { adapter, result } of builds) {
    const toolHome = path.join(genDir, adapter.id);
    if (!opts.dryRun) {
      rmSync(toolHome, { recursive: true, force: true });
    }

    for (const file of result.files) {
      const abs = resolveFilePath(adapter, toolHome, file);
      if (!file.managed) {
        log.debug(
          `merge-fragment ${path.relative(genDir, abs)} → ${file.mergeTarget ?? '?'} ` +
            `[${(file.managedPaths ?? []).join(', ')}]`,
        );
      }
      if (opts.dryRun) {
        log.info(`[dry-run] ${file.managed ? 'write' : 'merge'} ${path.relative(genDir, abs)}`);
        continue;
      }
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, file.content, { mode: file.mode ?? 0o644 });
      if (file.mode) {
        // writeFileSync mode is masked by umask; enforce exact bits for scripts.
        chmodSync(abs, file.mode);
      }
    }

    const compat = renderCompatibility(adapter.id, result.unsupported);
    if (!opts.dryRun) {
      writeFileSync(path.join(toolHome, 'COMPATIBILITY.md'), compat);
    }

    log.info(
      `${adapter.id}: ${result.files.length} file(s)` +
        (result.unsupported.length ? `, ${result.unsupported.length} compatibility note(s)` : '') +
        (opts.dryRun ? ' (dry-run)' : ` → ${path.relative(process.cwd(), toolHome)}`),
    );
  }

  return { core, builds };
}
