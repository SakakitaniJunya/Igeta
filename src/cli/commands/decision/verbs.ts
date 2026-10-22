// decision-accept・reject・supersede・amend の入口。引数を読んで recordDecision に渡すだけ (書き込みは record.ts の 1 か所)。

import { resolve } from 'node:path';
import { ExitCode } from '../../../core/ExitCode.js';
import { ArgParseError, parseArgs } from '../../Args.js';
import type { CommandContext } from '../../Command.js';
import { Command } from '../../Command.js';
import type { GitHubPort } from './port.js';
import type { DecisionVerb } from './record.js';
import { recordDecision } from './record.js';

const COMMON_USAGE = ['  --dry-run      計画を MOVE・APPEND・REWRITE・SET の行で出し、何も書かない', '  --root <dir>   対象リポジトリ (既定: カレントディレクトリ)'];
const todayOf = (): string => new Date().toISOString().slice(0, 10);

abstract class DecisionVerbCommand extends Command {
  protected abstract readonly verb: DecisionVerb;
  /** 動詞ごとの、必須の値つきオプション */
  protected abstract readonly required: readonly string[];

  constructor(private readonly port: () => GitHubPort) {
    super();
  }

  protected get argSpec(): { valueOptions: string[]; boolOptions: string[] } {
    return { valueOptions: ['root', 'by', 'evidence', 'reason', 'by-adr'], boolOptions: ['dry-run'] };
  }

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, this.argSpec);
    const [target, ...extra] = args.positional;
    if (target === undefined || extra.length > 0) throw new ArgParseError('ADR の id か番号を 1 つ渡す');
    for (const option of this.required) if (args.get(option) === undefined) throw new ArgParseError(`--${option} が要る`);
    const outcome = await recordDecision({
      root: resolve(ctx.cwd, args.get('root') ?? '.'),
      igetaRoot: ctx.igetaRoot,
      verb: this.verb,
      target,
      by: args.get('by'),
      evidence: args.get('evidence'),
      reason: args.get('reason'),
      byAdr: args.get('by-adr'),
      isDryRun: args.has('dry-run'),
      port: this.port(),
      today: todayOf(),
    });
    for (const line of outcome.lines) (outcome.exitCode === ExitCode.Ok ? ctx.stdout : ctx.stderr)(line);
    return outcome.exitCode;
  }
}

export class DecisionAcceptCommand extends DecisionVerbCommand {
  readonly name = 'decision-accept';
  readonly summary = 'proposed の ADR を承認済として記録する (merge 済みの PR を gh で確かめ、履歴・フォルダ・索引を書く)';
  protected readonly verb = 'accept';
  protected readonly required = ['by', 'evidence'];
  override readonly usage = ['  igeta decision-accept <id|番号> --by <名前> --evidence <PR の URL> [--dry-run]', '', ...COMMON_USAGE];
}

export class DecisionRejectCommand extends DecisionVerbCommand {
  readonly name = 'decision-reject';
  readonly summary = 'proposed の ADR を却下として記録する (根拠は PR か Issue。--by が閉じた・merge した記録)';
  protected readonly verb = 'reject';
  protected readonly required = ['by', 'evidence', 'reason'];
  override readonly usage = ['  igeta decision-reject <id|番号> --by <名前> --evidence <PR か Issue の URL> --reason <1 行> [--dry-run]', '', ...COMMON_USAGE];
}

export class DecisionSupersedeCommand extends DecisionVerbCommand {
  readonly name = 'decision-supersede';
  readonly summary = '承認済の ADR を、新しく承認済になった ADR で置き換えたと記録する (旧を retired/ へ移す)';
  protected readonly verb = 'supersede';
  protected readonly required = ['by-adr'];
  override readonly usage = ['  igeta decision-supersede <旧の id|番号> --by-adr <新の id|番号> [--dry-run]', '', ...COMMON_USAGE];
}

export class DecisionAmendCommand extends DecisionVerbCommand {
  readonly name = 'decision-amend';
  readonly summary = '承認後に直した ADR の本文を、新しい PR を根拠に改訂として記録する (移動しない)';
  protected readonly verb = 'amend';
  protected readonly required = ['by', 'evidence'];
  override readonly usage = ['  igeta decision-amend <id|番号> --by <名前> --evidence <PR の URL> [--dry-run]', '', ...COMMON_USAGE];
}
