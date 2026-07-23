#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { runBuild } from './commands/build.js';
import { runInstall } from './commands/install.js';
import { runUninstall } from './commands/uninstall.js';
import { runDiff } from './commands/diff.js';
import { createLogger } from './util/log.js';

const HELP = `ai-agent-setup — render tool-neutral core/ config for Claude Code and Codex

Usage:
  ai-agent-setup <command> [options]

Commands:
  build        Render core/ into generated/<tool>/ (no HOME is touched)
  install      Install rendered config into a HOME (backs up + merges safely)
  update       Re-render and reconcile an existing install
  diff         Show what an install/update would change (no writes)
  uninstall    Remove managed files, restore backups, strip merged entries
  doctor       (coming soon) Health-check core/ and any install
  init         (coming soon) Scaffold project-local config

Options:
  --target <claude|codex|all>   Which tool(s) to act on (default: all)
  --dry-run                     Show what would happen without writing
  --force                       Proceed despite validation errors / conflicts
  --verbose                     Extra logging
  --home <dir>                  Operate on this HOME instead of the real one
  -h, --help                    Show this help
`;

function main(argv: string[]): number {
  const command = argv[0];
  const rest = argv.slice(1);

  if (!command || command === '-h' || command === '--help' || command === 'help') {
    console.log(HELP);
    return command ? 0 : 1;
  }

  const { values } = parseArgs({
    args: rest,
    options: {
      target: { type: 'string', default: 'all' },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
      home: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });

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
    case 'diff':
      runDiff(common);
      return 0;
    case 'uninstall':
      runUninstall(common);
      return 0;
    case 'doctor':
    case 'init':
      log.error(`"${command}" is not implemented yet.`);
      return 2;
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
