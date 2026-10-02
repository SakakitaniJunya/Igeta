import { resolve } from 'node:path';
import { ExitCode } from '../../core/ExitCode.js';
import { Report } from '../../core/Report.js';
import type { GhRunner } from '../../gate/BranchProtection.js';
import { NOT_CHECKED, inspectProtection, readDefaultBranchProtection, runGh } from '../../gate/BranchProtection.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

export interface DoctorCommandOptions {
  /** gh の呼び出し。省略時は実際の gh (テストが記録した応答に差し替える。本物の GitHub は呼ばない) */
  readonly runGh?: GhRunner;
}

/**
 * GitHub の保護が、人の承認を実際に求める設定かを点検する (ADR-0008 決定 6、テスト仕様 01 の R7)。
 * 既定ブランチの保護 (従来のブランチ保護と ruleset) と CODEOWNERS の誤りを gh で読み、4 つの項目を 1 つずつ出す。
 * 終了コード: 0 = 4 つともそろっている / 1 = 欠けている (保護を置けない契約・CODEOWNERS が無いときも) /
 * 2 = gh が無い・権限が無くて読めない・60 秒で終わらないなどの検査不能。確かめないことは、点検が通ったときも出力に書く。
 */
export class DoctorCommand extends Command {
  readonly name = 'doctor';
  readonly summary = 'GitHub の保護が、人の承認を実際に求める設定か点検する (gh が要る)';
  override readonly usage = [
    '  --root <dir>   対象リポジトリ (gh を実行するディレクトリ。既定: カレントディレクトリ)',
    '',
    '  既定ブランチの保護 (従来のブランチ保護と ruleset) と、GitHub が返す CODEOWNERS の誤りを読み、次の 4 つを出す:',
    '  PR が必須 / CODEOWNERS の持ち主のレビューが必須 / 新しい push で承認を取り消す / CODEOWNERS の誤りが 0 件',
    '  終了コード: 0 = 4 つともそろっている / 1 = 欠けている (保護を置けない契約・CODEOWNERS が無いときも) /',
    '              2 = gh が無い・権限が無くて読めない・60 秒で終わらない (検査不能。成功にはしない)',
    '  確かめないこと (持ち主の実在と権限・管理者の迂回・必須の検査・既定ブランチ以外の保護) も、出力に書く',
  ];

  readonly #runGh: GhRunner;

  constructor(options: DoctorCommandOptions = {}) {
    super();
    this.#runGh = options.runGh ?? ((args, cwd) => runGh(args, cwd));
  }

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, { valueOptions: ['root'] });
    if (args.positional.length > 0) throw new ArgParseError(`余分な引数: ${args.positional.join(' ')}`);

    const read = readDefaultBranchProtection(this.#runGh, resolve(args.get('root') ?? ctx.cwd));
    const report = new Report();
    if ('cannotCheck' in read) {
      report.add({ severity: 'cannot-check', message: `GitHub の保護の設定を確かめられない: ${read.cannotCheck}` });
      ctx.stderr(report.format());
      return report.exitCode;
    }

    const { repo, branch } = read.report;
    ctx.stdout(`保護ブランチ: ${branch} (${repo})`);
    for (const item of inspectProtection(read.report)) {
      if (item.state === 'ok') {
        ctx.stdout(`  OK ${item.label} (${item.detail})`);
      } else if (item.state === 'missing') {
        ctx.stdout(`  NG ${item.label}: ${item.detail}`);
        report.add({ severity: 'violation', message: `保護ブランチ ${branch} は「${item.label}」を満たしていない: ${item.detail}` });
      } else {
        ctx.stdout(`  ?? ${item.label}: ${item.detail}`);
        report.add({ severity: 'cannot-check', message: `保護ブランチ ${branch} の「${item.label}」を確かめられない: ${item.detail}` });
      }
    }
    ctx.stdout('確かめないこと (この点検は GitHub の設定だけを読む):');
    for (const text of NOT_CHECKED) ctx.stdout(`  - ${text}`);

    if (report.isEmpty) {
      ctx.stdout(`OK 保護ブランチ ${branch} は 4 つの項目をすべて満たしている`);
      return ExitCode.Ok;
    }
    ctx.stderr(report.format());
    return report.exitCode;
  }
}
