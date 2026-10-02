import { resolve } from 'node:path';
import { ContextBoundaryCheck } from '../../checks/ContextBoundaryCheck.js';
import type { Check } from '../../core/Check.js';
import { ExitCode } from '../../core/ExitCode.js';
import { Report } from '../../core/Report.js';
import { ContextFilesModule } from '../../generators/ContextFilesModule.js';
import { ContextSizeModule } from '../../generators/ContextSizeModule.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { ParsedArgs } from '../Args.js';
import { CheckCommand } from '../CheckCommand.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

export class ContextBoundaryCheckCommand extends CheckCommand {
  readonly name = 'context-boundary-check';
  readonly summary = 'まとまり (context) の境界を越えた直接参照を検査する (既定 OFF)';
  override readonly usage = [
    '  --root <dir>     対象リポジトリ (既定: カレントディレクトリ)',
    '  --docs <dir>     検査対象 (既定: <root>/docs)',
    '  --config <path>  .igeta.json の場所 (既定: <root>/.igeta.json)',
  ];

  protected override readonly argSpec = { valueOptions: ['docs', 'config'] };

  protected createCheck(args: ParsedArgs): Check {
    return new ContextBoundaryCheck({ docsDir: args.get('docs'), configPath: args.get('config') });
  }
}

export class ContextSizeCommand extends Command {
  readonly name = 'context-size';
  readonly summary = '指定したまとまりの総行数 (自分の文書 + 隣の約束) を出す。省略時は全部一覧する';
  override readonly usage = [
    '  igeta context-size [<context>] [--root <dir>] [--docs <dir>] [--config <path>]',
    '',
    '  --root <dir>     対象リポジトリ (既定: カレントディレクトリ)',
    '  --docs <dir>     検査対象 (既定: <root>/docs)',
    '  --config <path>  .igeta.json の場所 (既定: <root>/.igeta.json)',
  ];

  protected readonly argSpec = { valueOptions: ['root', 'docs', 'config'] };

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, this.argSpec);
    if (args.positional.length > 1) throw new ArgParseError(`余分な引数: ${args.positional.slice(1).join(' ')}`);
    const targetRoot = resolve(args.get('root') ?? ctx.cwd);
    const context = args.positional[0];

    const module = new ContextSizeModule({ targetRoot, docsDir: args.get('docs'), configPath: args.get('config') });
    const result = module.analyze(context);

    for (const entry of result.entries) {
      const mark = entry.overLimit ? 'OVER ' : '';
      ctx.stdout(`${mark}${entry.context}: ${entry.totalLines} 行 (${entry.limit === null ? '上限なし' : `上限 ${entry.limit}`})`);
      for (const file of entry.files) ctx.stdout(`  ${file.lines.toString().padStart(5)}  ${file.relPath}`);
    }

    const report = new Report();
    report.addAll(result.violations);
    if (report.isEmpty) {
      // 対象 0 件のまま無言で exit 0 にしない (code-reviewer round 1 non-blocking 5)。
      ctx.stdout(result.entries.length > 0 ? `OK ${this.name}` : `OK ${this.name} (対象のまとまりが無い)`);
    } else {
      ctx.stderr(report.format());
    }
    return report.exitCode;
  }
}

export class ContextFilesCommand extends Command {
  readonly name = 'context-files';
  readonly summary = 'AI が読むファイル一覧を 1 行 1 パスで出す';
  override readonly usage = [
    '  igeta context-files <context> [--root <dir>] [--docs <dir>] [--with-shared] [--json]',
    '',
    '  --root <dir>       対象リポジトリ (既定: カレントディレクトリ)',
    '  --docs <dir>       検査対象 (既定: <root>/docs)',
    '  --with-shared      既定 (map/glossary/自分の地図) に加えて共有文書を全部出す (旧い構成だけ。新しい構成は範囲がフォルダで決まり、結果は変わらない)',
    '  --json             JSON 配列で出す',
  ];

  protected readonly argSpec = { valueOptions: ['root', 'docs'], boolOptions: ['with-shared', 'json'] };

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, this.argSpec);
    if (args.positional.length !== 1) throw new ArgParseError('対象のまとまりを 1 件指定する: igeta context-files <context>');
    const targetRoot = resolve(args.get('root') ?? ctx.cwd);
    const context = args.positional[0] ?? '';

    const module = new ContextFilesModule({ targetRoot, docsDir: args.get('docs') });
    const result = module.analyze(context, args.has('with-shared'));

    if (result.error !== null) {
      ctx.stderr(`CANNOT-CHECK ${result.error.message}`);
      return ExitCode.CannotCheck;
    }

    if (args.has('json')) {
      ctx.stdout(JSON.stringify(result.files));
    } else {
      for (const file of result.files) ctx.stdout(file);
    }
    return ExitCode.Ok;
  }
}
