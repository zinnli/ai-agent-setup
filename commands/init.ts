import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { atomicWrite } from '../fs/atomic.js';
import { createLogger, type Logger } from '../util/log.js';

export interface InitOptions {
  dir?: string;
  force?: boolean;
  verbose?: boolean;
  logger?: Logger;
}

interface ProjectInfo {
  packageManager: string | null;
  framework: string | null;
  typescript: boolean;
  monorepo: boolean;
  scripts: { lint: string | null; typecheck: string | null; test: string | null; build: string | null };
}

/**
 * Scaffold project-local CLAUDE.md + AGENTS.md from detected project facts.
 * Only writes into the given project directory (never HOME). Anything that
 * cannot be confirmed is left as a TODO rather than guessed. Existing files are
 * not overwritten without --force.
 */
export function runInit(opts: InitOptions): void {
  const log = opts.logger ?? createLogger({ verbose: opts.verbose });
  const dir = path.resolve(opts.dir ?? process.cwd());
  const info = detectProject(dir);

  const body = renderProjectDoc(info);
  for (const name of ['CLAUDE.md', 'AGENTS.md']) {
    const target = path.join(dir, name);
    if (existsSync(target) && !opts.force) {
      log.warn(`${name} already exists — skipped (use --force to overwrite)`);
      continue;
    }
    atomicWrite(target, body, 0o644);
    log.info(`wrote ${name}`);
  }
}

export function detectProject(dir: string): ProjectInfo {
  const info: ProjectInfo = {
    packageManager: null,
    framework: null,
    typescript: false,
    monorepo: false,
    scripts: { lint: null, typecheck: null, test: null, build: null },
  };

  // package manager from lockfile
  const lock: [string, string][] = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ];
  for (const [file, pm] of lock) if (existsSync(path.join(dir, file))) { info.packageManager = pm; break; }

  const pkgPath = path.join(dir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        packageManager?: string;
        workspaces?: unknown;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      if (!info.packageManager && pkg.packageManager) info.packageManager = pkg.packageManager.split('@')[0]!;
      if (pkg.workspaces) info.monorepo = true;
      info.typescript = 'typescript' in deps || existsSync(path.join(dir, 'tsconfig.json'));
      info.framework = detectFramework(deps);
      const s = pkg.scripts ?? {};
      // Only record scripts that actually exist — never invent a command.
      info.scripts.lint = pickScript(s, ['lint']);
      info.scripts.typecheck = pickScript(s, ['typecheck', 'type-check', 'tsc']);
      info.scripts.test = pickScript(s, ['test']);
      info.scripts.build = pickScript(s, ['build']);
    } catch {
      /* leave defaults */
    }
  }

  if (info.monorepo === false && existsSync(path.join(dir, 'pnpm-workspace.yaml'))) info.monorepo = true;
  return info;
}

function detectFramework(deps: Record<string, string>): string | null {
  if ('next' in deps) return 'Next.js';
  if ('react' in deps) return 'React';
  if ('vue' in deps) return 'Vue';
  if ('svelte' in deps) return 'Svelte';
  if ('@angular/core' in deps) return 'Angular';
  return null;
}

function pickScript(scripts: Record<string, string>, names: string[]): string | null {
  const pm = 'run';
  for (const n of names) if (scripts[n]) return `${pm} ${n}`;
  return null;
}

function renderProjectDoc(info: ProjectInfo): string {
  const cmd = (label: string, script: string | null, mgr: string | null) =>
    `- ${label}: ${script ? '`' + (mgr ?? 'npm') + ' ' + script + '`' : 'TODO (감지되지 않음 — 직접 채우기)'}`;

  return [
    '<!-- ai-agent-setup init: 프로젝트 로컬 지침. 감지되지 않은 값은 TODO로 남겨두었습니다. -->',
    '# 프로젝트 지침',
    '',
    '## 환경',
    `- 패키지 매니저: ${info.packageManager ?? 'TODO'}`,
    `- 프레임워크: ${info.framework ?? 'TODO'}`,
    `- TypeScript: ${info.typescript ? '사용' : 'TODO/미사용'}`,
    `- 모노레포: ${info.monorepo ? '예' : '아니오'}`,
    '',
    '## 명령',
    cmd('린트', info.scripts.lint, info.packageManager),
    cmd('타입체크', info.scripts.typecheck, info.packageManager),
    cmd('테스트', info.scripts.test, info.packageManager),
    cmd('빌드', info.scripts.build, info.packageManager),
    '',
    '## 작업 규칙',
    '- 변경 후에는 감지된 검증 명령(타입체크·린트·테스트)을 실행하고 결과를 보고한다.',
    '- 추측하지 말고 확인된 사실만 기록한다. 위 TODO는 직접 채운다.',
    '',
  ].join('\n');
}
