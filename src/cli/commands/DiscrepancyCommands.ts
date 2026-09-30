import { join, resolve } from 'node:path';
import { ExitCode } from '../../core/ExitCode.js';
import { addDiscrepancy, buildDiscrepancyReport } from '../../generators/DiscrepancyModule.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

/** 件数の行を `<category> <n> 件 (事前捕捉 <caught>/<n> = <pct>%)` に整形する。 */
function formatRow(label: string, count: number, caught: number): string {
  const pct = count === 0 ? 0 : Math.round((caught / count) * 100);
  return `${label} ${count} 件 (事前捕捉 ${caught}/${count} = ${pct}%)`;
}

export class DiscrepancyAddCommand extends Command {
  readonly name = 'discrepancy-add';
  readonly summary = '評価で見つかった食い違いを提出物のディレクトリに記録する';
  override readonly usage = [
    '  igeta discrepancy-add <提出物のディレクトリ> --location "<repo 相対パス>[#<anchor>]" --category <種類>',
    '      [--source <doc-id>/PREFIX-nnn] [--caught-by <検査名>] [--fixed-in <sha>] [--root <dir>]',
    '',
    '  提出物のディレクトリの discrepancies.log.jsonl に 1 行追記する (追記のみ)。',
    '  --category は閉集合: scope-overstatement / open-stated-as-final / missing-confirmation-item /',
    '  stale-copy-across-sources / mermaid-unrenderable',
  ];

  protected readonly argSpec = { valueOptions: ['root', 'location', 'category', 'source', 'caught-by', 'fixed-in'] };

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, this.argSpec);
    if (args.positional.length !== 1) throw new ArgParseError('提出物のディレクトリを 1 つ指定する');
    const location = args.get('location');
    if (location === undefined) throw new ArgParseError('--location が必要');
    const category = args.get('category');
    if (category === undefined) throw new ArgParseError('--category が必要');

    const result = addDiscrepancy({
      submissionDir: resolve(ctx.cwd, args.positional[0] ?? ''),
      location,
      category,
      sourceId: args.get('source'),
      caughtBy: args.get('caught-by'),
      fixedInCommit: args.get('fixed-in'),
      targetRoot: resolve(args.get('root') ?? ctx.cwd),
    });
    if (result.kind === 'rejected') {
      const label = result.violation.severity === 'cannot-check' ? 'CANNOT-CHECK' : 'VIOLATION';
      ctx.stderr(`${label} ${result.violation.message}`);
      return result.violation.severity === 'cannot-check' ? ExitCode.CannotCheck : ExitCode.Violation;
    }
    ctx.stdout(`WRITE ${result.path}`);
    return ExitCode.Ok;
  }
}

export class DiscrepancyReportCommand extends Command {
  readonly name = 'discrepancy-report';
  readonly summary = '食い違いログを集計する (既定 OFF・手動実行)';
  override readonly usage = [
    '  igeta discrepancy-report [--root <dir>] [--docs <dir>] [--dir <dir>]',
    '',
    '  --root <dir>   対象リポジトリ (既定: カレントディレクトリ)',
    '  --docs <dir>   ログの探索対象 (既定: <root>/docs)',
    '  --dir <dir>    提出物のディレクトリ (既定: docs の中の食い違いログを全部)',
    '',
    '  違反ではなく集計情報を出す。ログが 1 つも無ければ OK で終わる。',
  ];

  protected readonly argSpec = { valueOptions: ['root', 'docs', 'dir'] };

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, this.argSpec);
    if (args.positional.length > 0) throw new ArgParseError(`余分な引数: ${args.positional.join(' ')}`);

    const targetRoot = resolve(args.get('root') ?? ctx.cwd);
    const dir = args.get('dir');
    const result = buildDiscrepancyReport({
      targetRoot,
      docsDir: resolve(ctx.cwd, args.get('docs') ?? join(targetRoot, 'docs')),
      submissionDir: dir === undefined ? undefined : resolve(ctx.cwd, dir),
    });
    if (result.kind === 'rejected') {
      const label = result.violation.severity === 'cannot-check' ? 'CANNOT-CHECK' : 'VIOLATION';
      ctx.stderr(`${label} ${result.violation.message}`);
      return result.violation.severity === 'cannot-check' ? ExitCode.CannotCheck : ExitCode.Violation;
    }
    if (result.files === 0) {
      ctx.stdout(`OK ${this.name}`);
      return ExitCode.Ok;
    }
    for (const row of result.rows) ctx.stdout(formatRow(row.category, row.count, row.caught));
    ctx.stdout(formatRow('total', result.total.count, result.total.caught));
    return ExitCode.Ok;
  }
}
