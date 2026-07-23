#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { runBuild } from './commands/build.js';
import { createLogger } from './util/log.js';

const HELP = `ai-agent-setup — render tool-neutral core/ config for Claude Code and Codex

Usage:
  ai-agent-setup <command> [options]

Commands:
  build        Render core/ into generated/<tool>/ (no HOME is touched)
  install      (coming soon) Install generated config into a HOME
  update       (coming soon) Re-render and update an existing install
  diff         (coming soon) Show differences vs the installed config
  doctor       (coming soon) Health-check core/ and any install
  uninstall    (coming soon) Remove managed files and restore backups
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

  switch (command) {
    case 'build':
      runBuild({
        target: values.target ?? 'all',
        dryRun: values['dry-run'],
        force: values.force,
        verbose: values.verbose,
        logger: log,
      });
      return 0;
    case 'install':
    case 'update':
    case 'diff':
    case 'doctor':
    case 'uninstall':
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
