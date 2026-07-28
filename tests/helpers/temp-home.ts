import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Logger } from '../../util/log.js';

/** A throwaway HOME under the system temp dir (never the real HOME). */
export interface TempHome {
  home: string;
  read(rel: string): string;
  readJson(rel: string): any;
  exists(rel: string): boolean;
  write(rel: string, content: string): void;
  writeJson(rel: string, value: unknown): void;
  cleanup(): void;
}

export function makeTempHome(): TempHome {
  const home = mkdtempSync(path.join(os.tmpdir(), 'aas-home-'));
  const abs = (rel: string) => path.join(home, rel);
  return {
    home,
    read: (rel) => readFileSync(abs(rel), 'utf8'),
    readJson: (rel) => JSON.parse(readFileSync(abs(rel), 'utf8')),
    exists: (rel) => existsSync(abs(rel)),
    write: (rel, content) => {
      mkdirSync(path.dirname(abs(rel)), { recursive: true });
      writeFileSync(abs(rel), content);
    },
    writeJson: (rel, value) => {
      mkdirSync(path.dirname(abs(rel)), { recursive: true });
      writeFileSync(abs(rel), JSON.stringify(value, null, 2) + '\n');
    },
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}

/** A logger that swallows output, so tests stay quiet. */
export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};
