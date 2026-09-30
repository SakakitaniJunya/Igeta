import { resolve } from 'node:path';
import { ExitCode } from '../../core/ExitCode.js';
import { formatForbidHit } from '../../export/ForbidScan.js';
import { runExport } from '../../export/ExportPipeline.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

export class ExportCommand extends Command {
  readonly name = 'export';
  readonly summary = '章 Markdown から先方提出用の PDF 1 冊を出す';
  override readonly usage = [
    '  <path/to/deliverable.json>  必須。章一覧・forbid・出力先を持つ manifest',
    '  --html-only                 PDF 化せず HTML だけ出す (Chromium 不要)',
  ];

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, { boolOptions: ['html-only'] });
    if (args.positional.length !== 1) {
      throw new ArgParseError('manifest のパスを 1 つだけ指定する');
    }
    const manifestPath = resolve(ctx.cwd, args.positional[0] ?? '');

    const outcome = await runExport({ manifestPath, htmlOnly: args.has('html-only') });

    switch (outcome.kind) {
      case 'manifest-error': {
        for (const message of outcome.messages) ctx.stderr(`ERROR ${message}`);
        return ExitCode.CannotCheck;
      }
      case 'unclosed-autogen': {
        for (const message of outcome.messages) ctx.stderr(`ERROR ${message}`);
        return ExitCode.CannotCheck;
      }
      case 'forbid-violation': {
        for (const hit of outcome.hits) ctx.stderr(`FORBID ${formatForbidHit(hit)}`);
        ctx.stderr(`\n${outcome.hits.length} 件、提出物に含められない語が見つかった。1 ファイルも書いていない。`);
        return ExitCode.Violation;
      }
      case 'mermaid-error': {
        for (const message of outcome.messages) ctx.stderr(`ERROR ${message}`);
        return ExitCode.Violation;
      }
      case 'chromium-not-found': {
        ctx.stderr(`ERROR ${outcome.message}`);
        return ExitCode.CannotCheck;
      }
      case 'ok': {
        for (const warning of outcome.warnings) ctx.stderr(`WARN ${warning}`);
        ctx.stdout(`WRITE ${outcome.htmlPath}`);
        if (outcome.pdfPath !== null) ctx.stdout(`WRITE ${outcome.pdfPath}`);
        return ExitCode.Ok;
      }
    }
  }
}
