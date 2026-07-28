import type { Diagnostic } from '../loader/model.js';

/** Minimal console reporter. Honors verbose/quiet; dry-run callers prefix "[dry-run]". */
export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

export function createLogger(opts: { verbose?: boolean } = {}): Logger {
  return {
    info: (m) => console.log(m),
    warn: (m) => console.warn(`⚠ ${m}`),
    error: (m) => console.error(`✗ ${m}`),
    debug: (m) => {
      if (opts.verbose) console.log(`  ${m}`);
    },
  };
}

/**
 * A logger that swallows info/warn/debug (keeps errors) — used while COMPUTING a
 * report model so the inspection commands can drive install/diff planning
 * without leaking their progress logs into --json or text output.
 */
export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: (m) => console.error(`✗ ${m}`),
  debug: () => {},
};

/** Print diagnostics; returns true if any error-level diagnostic is present. */
export function reportDiagnostics(diags: Diagnostic[], log: Logger): boolean {
  let hasError = false;
  for (const d of diags) {
    const where = d.sourceFile ? ` (${d.sourceFile})` : '';
    const line = `[${d.category}] ${d.message}${where}`;
    if (d.level === 'error') {
      hasError = true;
      log.error(line);
    } else {
      log.warn(line);
    }
  }
  return hasError;
}
