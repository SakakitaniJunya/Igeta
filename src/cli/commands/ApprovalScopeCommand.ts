import { resolve } from 'node:path';
import { ExitCode } from '../../core/ExitCode.js';
import { Report } from '../../core/Report.js';
import type { BaseSpec } from '../../gate/ApprovalScope.js';
import { formatJudgement, judgeApprovalScope } from '../../gate/ApprovalScope.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

/** CI が渡す保護ブランチ (PR の向き先) の名前。GitHub Actions の pull_request / pull_request_target で設定される。 */
const CI_BASE_BRANCH_VARIABLE = 'GITHUB_BASE_REF';

export interface ApprovalScopeCommandOptions {
  /** 環境変数。省略時は process.env (テストで差し替える) */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/**
 * 人の承認が要る変更かを、差分のパスだけで判定する (ADR-0008)。
 * 終了コードは既存の 3 値に割り当てる: ai = 0 (Ok) / human = 1 (Violation) / 検査不能 = 2 (CannotCheck)。
 * 自動で merge する仕組みは 0 のときだけ進む (1 でも 2 でも止まる)。
 */
export class ApprovalScopeCommand extends Command {
  readonly name = 'approval-scope';
  readonly summary = '人の承認が要る変更かを差分のパスだけで判定する (human / ai)';
  override readonly usage = [
    '  igeta approval-scope --ci [--root <dir>]',
    '  igeta approval-scope --base <ref> [--root <dir>]',
    '',
    `  --ci           CI 用。起点は環境変数 ${CI_BASE_BRANCH_VARIABLE} の保護ブランチ (origin/<名前>) と HEAD の merge-base に固定する。`,
    '                 GitHub Actions では actions/checkout に fetch-depth: 0 を指定する。得られなければ検査不能。',
    '                 pull_request_target は既定で保護ブランチ側を checkout するので差分が空 (= ai) になる。PR の head を checkout して使う',
    '  --base <ref>   手元の確認用。<ref> と HEAD の merge-base を起点にする。CI では使わず、--ci と同時に指定できない',
    '  --root <dir>   対象リポジトリ (git の作業ツリーの最上位。既定: カレントディレクトリ)',
    '',
    '  出力: 1 行目に human か ai、続けて人の承認が要る理由になったパス',
    '  終了コード: 0 = ai / 1 = human / 2 = 検査不能 (旧い構成の repo・起点が得られない・git が使えない など)。',
    '              検査不能を ai として扱わない',
  ];

  readonly #env: Readonly<Record<string, string | undefined>>;

  constructor(options: ApprovalScopeCommandOptions = {}) {
    super();
    this.#env = options.env ?? process.env;
  }

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, { valueOptions: ['root', 'base'], boolOptions: ['ci'] });
    if (args.positional.length > 0) throw new ArgParseError(`余分な引数: ${args.positional.join(' ')}`);
    const ci = args.has('ci');
    const baseRef = args.get('base');
    if (ci && baseRef !== undefined) {
      throw new ArgParseError('--ci と --base は同時に指定できない (CI の起点は保護ブランチとの merge-base に固定する)');
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
            `--ci: CI の環境変数 ${CI_BASE_BRANCH_VARIABLE} から保護ブランチを得られない。` +
            'pull_request の CI で実行する。手元の確認には --base <ref> を使う',
        });
      } else {
        base = { mode: 'ci', branch };
      }
    }

    if (base !== null) {
      const result = await judgeApprovalScope({ root: resolve(args.get('root') ?? ctx.cwd), igetaRoot: ctx.igetaRoot, base });
      if ('violation' in result) {
        report.add(result.violation);
      } else {
        for (const line of formatJudgement(result.judgement)) ctx.stdout(line);
        return result.judgement.verdict === 'human' ? ExitCode.Violation : ExitCode.Ok;
      }
    }

    ctx.stderr(report.format());
    return report.exitCode;
  }
}
