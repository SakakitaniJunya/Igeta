#!/usr/bin/env node
import { IGETA_ROOT } from './core/Paths.js';
import { Cli } from './cli/Cli.js';
import { AgreementApproveCommand, AgreementCheckCommand } from './cli/commands/AgreementCommands.js';
import { AnalyzeCommand } from './cli/commands/AnalyzeCommand.js';
import { ContextBoundaryCheckCommand, ContextFilesCommand, ContextSizeCommand } from './cli/commands/ContextCommands.js';
import { DiscrepancyAddCommand, DiscrepancyReportCommand } from './cli/commands/DiscrepancyCommands.js';
import { ExportCommand } from './cli/commands/ExportCommand.js';
import { FixIdsCommand } from './cli/commands/FixIdsCommand.js';
import { InitCommand } from './cli/commands/InitCommand.js';
import { MermaidCheckCommand } from './cli/commands/MermaidCheckCommand.js';
import {
  ProvenanceAcceptCommand,
  ProvenanceCaptureCommand,
  ProvenanceCheckCommand,
  ProvenanceCoverageCommand,
  SourceCoverageCommand,
} from './cli/commands/ProvenanceCommands.js';
import { ReviewSheetCommand } from './cli/commands/ReviewSheetCommand.js';
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
  .register(new ContextBoundaryCheckCommand())
  .register(new ContextSizeCommand())
  .register(new ContextFilesCommand())
  .register(new ProvenanceCaptureCommand())
  .register(new ProvenanceAcceptCommand())
  .register(new ProvenanceCheckCommand())
  .register(new ProvenanceCoverageCommand())
  .register(new SourceCoverageCommand())
  .register(new AgreementApproveCommand())
  .register(new AgreementCheckCommand())
  .register(new DiscrepancyAddCommand())
  .register(new DiscrepancyReportCommand())
  .register(new MermaidCheckCommand())
  .register(new ScaffoldCommand())
  .register(new ExportCommand())
  .register(new ReviewSheetCommand())
  .register(new AnalyzeCommand())
  .register(new FixIdsCommand())
  .register(new VersionCheckCommand())
  .register(new UpgradeCommand());

const exitCode = await cli.run(process.argv.slice(2), {
  cwd: process.cwd(),
  igetaRoot: IGETA_ROOT,
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
});

process.exit(exitCode);
