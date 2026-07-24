#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { runBuild } from './commands/build.js';
import { runInstall } from './commands/install.js';
import { runUninstall } from './commands/uninstall.js';
import { runDiff } from './commands/diff.js';
import { runDoctor } from './commands/doctor.js';
import { runStatus } from './commands/status.js';
import { runList } from './commands/list.js';
import { runInit } from './commands/init.js';
import { createLogger } from './util/log.js';
import { repoRoot } from './util/paths.js';

const HELP = `ai-agent-setup — render tool-neutral core/ config for Claude Code and Codex

Usage:
  ai-agent-setup <command> [options]

Commands:
  build        Render core/ into generated/<tool>/ (no HOME is touched)
  install      Install rendered config into a HOME (backs up + merges safely)
  update       Re-render and reconcile an existing install
  status       Show install state, drift, and per-tool health (read-only)
  list         List core instructions/agents/skills/hooks/MCP and tool support
  diff         Show what an install/update would change (no writes)
  uninstall    Remove managed files, restore backups, strip merged entries
  doctor       Health-check the environment, core/, generated output, install
  init         Scaffold project-local CLAUDE.md + AGENTS.md from detected facts

Options:
  --target <claude|codex|all>   Which tool(s) to act on (default: all)
  --json                        Machine-readable output (status, list, diff, doctor)
  --dry-run                     Show what would happen without writing
  --force                       Proceed despite validation errors / conflicts
  --verbose                     Extra logging / detail
  --home <dir>                  Operate on this HOME instead of the real one
  --dir <dir>                   Project directory for \`init\`
  -h, --help                    Show this help
  -v, --version                 Show version
`;

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot(), 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function main(argv: string[]): number {
  const command = argv[0];
  const rest = argv.slice(1);

  if (command === '-v' || command === '--version' || command === 'version') {
    console.log(version());
    return 0;
  }
  if (!command || command === '-h' || command === '--help' || command === 'help') {
    console.log(HELP);
    return command ? 0 : 1;
  }

  const { values } = parseArgs({
    args: rest,
    options: {
      target: { type: 'string', default: 'all' },
      json: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
      home: { type: 'string' },
      dir: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
    allowPositionals: false,
  });

  if (values.version) {
    console.log(version());
    return 0;
  }
  if (values.help) {
    console.log(HELP);
    return 0;
  }

  const log = createLogger({ verbose: values.verbose });

  const common = {
    target: values.target ?? 'all',
    dryRun: values['dry-run'],
    force: values.force,
    verbose: values.verbose,
    json: values.json,
    ...(values.home ? { home: values.home } : {}),
    logger: log,
  };

  switch (command) {
    case 'build':
      runBuild(common);
      return 0;
    case 'install':
    case 'update':
      runInstall(common);
      return 0;
    case 'status':
      runStatus(common);
      return 0;
    case 'list':
      runList(common);
      return 0;
    case 'diff':
      runDiff(common);
      return 0;
    case 'uninstall':
      runUninstall(common);
      return 0;
    case 'doctor':
      return runDoctor(common).hasError ? 1 : 0;
    case 'init':
      runInit({
        force: values.force,
        verbose: values.verbose,
        ...(values.dir ? { dir: values.dir } : {}),
        logger: log,
      });
      return 0;
    default:
      log.error(`Unknown command "${command}".`);
      console.log(HELP);
      return 1;
  }
}

try {
  process.exit(main(process.argv.slice(2)));
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
