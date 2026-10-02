import { resolve } from 'node:path';
import { ExitCode } from '../../core/ExitCode.js';
import { Report } from '../../core/Report.js';
import type { GhRunner } from '../../gate/BranchProtection.js';
import { describeSource, judgePersonReview, readBranchProtection, runGh } from '../../gate/BranchProtection.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

export interface DoctorCommandOptions {
  /** gh の呼び出し。省略時は実際の gh (テストで差し替える) */
  readonly runGh?: GhRunner;
}

/**
 * repo の外にある設定を確かめる。いまは GitHub の保護ブランチだけ: docs/person/ の変更に人のレビューが
 * 必須になっているか (ADR-0008「限界」(2))。gh で読めたときだけ確かめ、読めなければ検査不能にする。
 * 終了コード: 0 = 読めて必須になっている / 読めたが必須でない (警告を出す。WARN は終了コードを変えない、
 * 他の検査の警告と同じ) / 2 = gh が無い・認証や権限で読めない などの検査不能。
 */
export class DoctorCommand extends Command {
  readonly name = 'doctor';
  readonly summary = 'GitHub の保護ブランチが docs/person/ の変更に人のレビューを必須にしているか確かめる (gh が要る)';
  override readonly usage = [
    '  --root <dir>      対象リポジトリ (gh を実行するディレクトリ。既定: カレントディレクトリ)',
    '  --branch <name>   確かめる保護ブランチ (既定: repo の既定ブランチ)',
    '',
    '  gh で読んだ設定 (必須の承認数・CODEOWNERS のレビューの要否。従来のブランチ保護と ruleset) を表示し、',
    '  承認が 1 件以上かつ CODEOWNERS のレビューが必須でなければ WARN を出す。',
    '  gh が無い・読めないときは検査不能 (終了コード 2)。成功にはしない',
  ];

  readonly #runGh: GhRunner;

  constructor(options: DoctorCommandOptions = {}) {
    super();
    this.#runGh = options.runGh ?? ((args, cwd) => runGh(args, cwd));
  }

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, { valueOptions: ['root', 'branch'] });
    if (args.positional.length > 0) throw new ArgParseError(`余分な引数: ${args.positional.join(' ')}`);
    const branch = args.get('branch');
    if (branch !== undefined && branch.trim() === '') throw new ArgParseError('--branch が空');

    const read = readBranchProtection(this.#runGh, resolve(args.get('root') ?? ctx.cwd), branch);
    const report = new Report();
    if ('cannotCheck' in read) {
      report.add({ severity: 'cannot-check', message: `保護ブランチの設定を確かめられない: ${read.cannotCheck}` });
      ctx.stderr(report.format());
      return report.exitCode;
    }

    const { repo, branch: protectedBranch, sources } = read.report;
    ctx.stdout(`保護ブランチ: ${protectedBranch} (${repo})`);
    for (const source of sources) ctx.stdout(`  ${describeSource(source)}`);

    const verdict = judgePersonReview(read.report);
    if (verdict.kind === 'required') {
      ctx.stdout('OK docs/person/ の変更に人のレビューが必須になっている');
      return ExitCode.Ok;
    }
    if (verdict.kind === 'not-required') {
      ctx.stderr(
        `WARN 保護ブランチ ${protectedBranch} は docs/person/ の変更に人のレビューを必須にしていない ` +
          `(必須の承認 ${verdict.approvals} 件・CODEOWNERS のレビュー ${verdict.codeOwnerReview ? '必須' : '不要'})。` +
          '承認が 1 件以上かつ CODEOWNERS のレビューが必須でないと、人の承認なしに merge できる (ADR-0008)',
      );
      return ExitCode.Ok;
    }
    report.add({
      severity: 'cannot-check',
      message:
        `保護ブランチ ${protectedBranch} の設定を全部は読めず、docs/person/ の変更に人のレビューが必須か確かめられない: ` +
        verdict.unreadable.join(' / '),
    });
    ctx.stderr(report.format());
    return report.exitCode;
  }
}
