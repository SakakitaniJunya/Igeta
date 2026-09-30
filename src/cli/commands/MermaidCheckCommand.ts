import { resolve } from 'node:path';
import { checkMermaidRendering } from '../../checks/MermaidCheck.js';
import { ExitCode } from '../../core/ExitCode.js';
import { Report } from '../../core/Report.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

export class MermaidCheckCommand extends Command {
  readonly name = 'mermaid-check';
  readonly summary = 'mermaid 図が描画できるかを検査する (早期検査、既定 OFF)';
  override readonly usage = [
    '  igeta mermaid-check [<file> ...] [--root <dir>] [--docs <dir>]',
    '',
    '  --root <dir>   対象リポジトリ (既定: カレントディレクトリ)',
    '  --docs <dir>   引数省略時の検査対象 (既定: <root>/docs)',
  ];

  protected readonly argSpec = { valueOptions: ['root', 'docs'] };

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, this.argSpec);
    const targetRoot = resolve(args.get('root') ?? ctx.cwd);
    const files = args.positional.length > 0 ? args.positional.map((p) => resolve(ctx.cwd, p)) : undefined;

    let violations;
    try {
      ({ violations } = await checkMermaidRendering({ targetRoot, docsDir: args.get('docs'), files }));
    } catch (error) {
      if (error instanceof ArgParseError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      ctx.stderr(`CANNOT-CHECK ${message}`);
      return ExitCode.CannotCheck;
    }

    const report = new Report();
    report.addAll(violations);
    if (report.isEmpty) ctx.stdout(`OK ${this.name}`);
    else ctx.stderr(report.format());
    return report.exitCode;
  }
}
