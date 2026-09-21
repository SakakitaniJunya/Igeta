#!/usr/bin/env node
import { IGETA_ROOT } from './core/Paths.js';
import { Cli } from './cli/Cli.js';
import { InitCommand } from './cli/commands/InitCommand.js';
import { ScaffoldCommand } from './cli/commands/ScaffoldCommand.js';
import {
  DocsCheckCommand,
  DocsGraphCommand,
  DomainDriftCommand,
  SecretScanCommand,
  TemplateCheckCommand,
} from './cli/commands/checkCommands.js';
import { UpgradeCommand, VersionCheckCommand } from './cli/commands/versionCommands.js';

const cli = new Cli()
  .register(new InitCommand())
  .register(new DocsGraphCommand())
  .register(new DocsCheckCommand())
  .register(new TemplateCheckCommand())
  .register(new DomainDriftCommand())
  .register(new SecretScanCommand())
  .register(new ScaffoldCommand())
  .register(new VersionCheckCommand())
  .register(new UpgradeCommand());

const exitCode = await cli.run(process.argv.slice(2), {
  cwd: process.cwd(),
  igetaRoot: IGETA_ROOT,
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
});

process.exit(exitCode);
