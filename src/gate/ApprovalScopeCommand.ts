import { resolve } from 'node:path';
import { ArgParseError, parseArgs } from '../cli/Args.js';
import type { CommandContext } from '../cli/Command.js';
import { Command } from '../cli/Command.js';
import { ExitCode } from '../core/ExitCode.js';
import { Report } from '../core/Report.js';
import type { BaseSpec } from './ApprovalScope.js';
import { formatJudgement, judgeApprovalScope } from './ApprovalScope.js';
import type { GitRunner } from './GitRepo.js';

/** CI が渡す、変更を入れる先のブランチ (PR の向き先) の名前。GitHub Actions の pull_request で設定される。 */
const CI_BASE_BRANCH_VARIABLE = 'GITHUB_BASE_REF';

export interface ApprovalScopeCommandOptions {
  /** 環境変数。省略時は process.env (テストで差し替える) */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** git の呼び出し。省略時は実際の git (テストで差し替える) */
  readonly git?: GitRunner;
}

/**
 * 人の承認が要るパスに、変更が触れたかを、パスだけで見分ける (ADR-0008 決定 3、テスト仕様 01)。
 * 終了コードは既存の 3 値に割り当てる: ai = 0 (Ok) / human = 1 (Violation) / 検査不能 = 2 (CannotCheck)。
 *
 * 他のコマンドは src/cli/commands/ に置くが、これは門の一部なので src/gate/ に置く (humanPaths の `src/gate/**` が守る)。
 */
export class ApprovalScopeCommand extends Command {
  readonly name = 'approval-scope';
  readonly summary = '人の承認が要るパスに変更が触れたかを、パスだけで見分ける (human / ai)';
  override readonly usage = [
    '  igeta approval-scope --ci [--root <dir>]',
    '  igeta approval-scope --base <ref> [--root <dir>]',
    '',
    `  --ci           CI 用。宛先は origin/<環境変数 ${CI_BASE_BRANCH_VARIABLE}>。commit の内容だけを見る。`,
    '                 GitHub Actions では actions/checkout に fetch-depth: 0 を指定する。origin を宛先の repo と見るので、',
    '                 fork の head を取り込んだ作業場では使わない',
    '  --base <ref>   手元の確認用。宛先は <ref>。作業ツリーの変更と未追跡のファイルも含める。--ci と同時に指定できない',
    '  --root <dir>   対象リポジトリ (git の作業ツリーの最上位。既定: カレントディレクトリ)',
    '',
    '  出力: 1 行目に human か ai、続けて人の承認が要る理由になったパス',
    '  終了コード: 0 = ai / 1 = human / 2 = 検査不能 (宛先が決まらない・宛先が旧い構成・git が使えない・',
    '              merge が衝突する など)。検査不能を ai として扱わない',
  ];

  readonly #env: Readonly<Record<string, string | undefined>>;
  readonly #git: GitRunner | undefined;

  constructor(options: ApprovalScopeCommandOptions = {}) {
    super();
    this.#env = options.env ?? process.env;
    this.#git = options.git;
  }

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, { valueOptions: ['root', 'base'], boolOptions: ['ci'] });
    if (args.positional.length > 0) throw new ArgParseError(`余分な引数: ${args.positional.join(' ')}`);
    const ci = args.has('ci');
    const baseRef = args.get('base');
    if (ci && baseRef !== undefined) {
      throw new ArgParseError('--ci と --base は同時に指定できない (CI の宛先は環境変数で決まる)');
    }
    if (!ci && baseRef === undefined) throw new ArgParseError('--ci か --base <ref> のどちらかが要る');
    if (baseRef !== undefined && baseRef.startsWith('-')) throw new ArgParseError(`--base が - で始まっている: ${baseRef}`);

    const report = new Report();
    let base: BaseSpec | null = null;
    if (baseRef !== undefined) {
      base = { mode: 'local', ref: baseRef };
    } else {
      const branch = this.#env[CI_BASE_BRANCH_VARIABLE];
      if (branch === undefined || branch === '') {
        report.add({
          severity: 'cannot-check',
          message:
            `--ci: CI の環境変数 ${CI_BASE_BRANCH_VARIABLE} から宛先のブランチを得られない。` +
            'pull_request の CI で実行する。手元の確認には --base <ref> を使う',
        });
      } else {
        base = { mode: 'ci', branch };
      }
    }

    if (base !== null) {
      const result = judgeApprovalScope({
        root: resolve(args.get('root') ?? ctx.cwd),
        base,
        ...(this.#git === undefined ? {} : { git: this.#git }),
      });
      if ('violation' in result) {
        report.add(result.violation);
      } else {
        for (const line of formatJudgement(result.judgement)) ctx.stdout(line);
        return result.judgement.verdict === 'human' ? ExitCode.Violation : ExitCode.Ok;
      }
    }

    // 検査不能の終了コードは Report 任せにせず、ここで固定する (Report の変更で、検査不能が 0 にならないように)
    ctx.stderr(report.format());
    return ExitCode.CannotCheck;
  }
}
