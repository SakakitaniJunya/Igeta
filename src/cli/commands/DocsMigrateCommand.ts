// `igeta docs-migrate` — 旧い構成・v3 の構成の repo を 3 フォルダ (person・ai・client) の構成へ「移す段」を適用まで行う (ADR-0003)。
// 書き直す段 (人の型への書き直し) は人と AI の作業。ここは作業の列と報告を出すだけ。
// 終了コード: 0 = 完了 (作業の列があっても) / 1 = 完了条件が 1 つ欠けた (作業ツリーを戻す手順を出す) / 2 = 止める条件 (何も書かない)。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGhPort } from '#decision/cli';
import { isoDateInTokyo } from '#decision/core';
import { ExitCode } from '../../core/ExitCode.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';
import { planMigration } from '../../generators/DocsMigratePlan.js';
import { applyPlan, rollbackCommand } from '../../generators/DocsMigrateApply.js';
import { completion, measure } from '../../generators/DocsMigrateVerify.js';
import { splitReportLines } from '../../generators/DocsMigrateSplit.js';
import type { EvidenceRow } from '../../generators/DocsMigrateDecisions.js';
import { migrateDecisions } from '../../generators/DocsMigrateDecisions.js';

export class DocsMigrateCommand extends Command {
  readonly name = 'docs-migrate';
  readonly summary = '旧い構成・v3 の構成の docs/ を 3 フォルダ (person・ai・client) へ移す (移す段。書き直す段は人と AI)';
  override readonly usage = [
    '  igeta docs-migrate --owner <持ち主> [--dry-run] [--root <dir>]',
    '  igeta docs-migrate --split-report [--root <dir>]',
    '',
    '  --owner <持ち主>  人の承認の持ち主 (@user・@org/team・メールアドレス)。AGENTS.md と .github/CODEOWNERS に書く',
    '  --dry-run         止める条件と計画を出す。何も書かない',
    '  --split-report    書き直す段のための報告 (由来が指す正本の行が変わったもの)。何も書かない',
    '  --decisions-evidence <file>',
    '                    決定の段 (<年>/ 直下の ADR を状態のフォルダへ移し、決定台帳に列を足す。移す段が空で、.igeta.json に',
    '                    decisions.approvers があるときに走る) の根拠の表。JSON の配列',
    '                    [{ "id": "adr-0001-…", "by": "<approvers の名前>", "evidence": "<merge 済みの PR の URL>" }]。',
    '                    表にある ADR だけ、gh で確かめて承認済にする。無い旧 accepted・旧 rejected は proposed/ に差し戻す',
    '  --root <dir>      対象リポジトリ (既定: カレントディレクトリ)',
    '',
    '  作業ツリーが clean であること (S1) が要る。commit も git add もしない。',
  ];

  protected readonly argSpec = { valueOptions: ['owner', 'root', 'decisions-evidence'], boolOptions: ['dry-run', 'split-report'] };

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, this.argSpec);
    if (args.positional.length > 0) throw new ArgParseError(`余分な引数: ${args.positional.join(' ')}`);
    const root = resolve(ctx.cwd, args.get('root') ?? '.');

    if (args.has('split-report')) {
      for (const line of splitReportLines(root)) ctx.stdout(line);
      return ExitCode.Ok;
    }

    const plan = planMigration({ root, owner: args.get('owner'), igetaRoot: ctx.igetaRoot });
    if (plan.stops.length > 0) {
      for (const stop of plan.stops) ctx.stdout(`STOP ${stop.code}: ${stop.path} — ${stop.reason}`);
      ctx.stdout(`止めた (${plan.stops.length} 件)。何も書いていない`);
      return ExitCode.CannotCheck;
    }
    for (const line of plan.lines) ctx.stdout(line.text);
    const isLayoutDone = plan.moves.size + plan.deletes.size + plan.edits.length + plan.creates.size + plan.approvals.length === 0;
    if (args.has('dry-run')) {
      ctx.stdout(`DRY-RUN docs-migrate: 移す ${plan.moves.size} 件・消す ${plan.deletes.size} 件・書く内容 ${plan.edits.length + plan.creates.size + plan.approvals.length} 件 (何も書いていない)`);
      return isLayoutDone ? this.#decisionStage(root, args, ctx, true) : ExitCode.Ok;
    }
    if (isLayoutDone) return this.#decisionStage(root, args, ctx, false);

    const before = await measure(root, ctx.igetaRoot);
    const applied = await applyPlan({ root, igetaRoot: ctx.igetaRoot, plan });
    // 戻す手順は、計画が実際に触った path から組み立てる (root README など、docs の外のリンクの書き換えも含む)
    const rollback = `作業ツリーを戻す: ${rollbackCommand(root, plan.touched)}`;
    if (!applied.ok) {
      ctx.stderr(`ERROR docs-migrate: ${applied.failure ?? '適用に失敗'}`);
      ctx.stderr(rollback);
      return ExitCode.Violation;
    }

    const result = await completion({ root, igetaRoot: ctx.igetaRoot, before, plan });
    if (result.problems.length > 0) {
      for (const problem of result.problems) ctx.stderr(`FAIL ${problem.code} ${problem.text}`);
      ctx.stderr(`完了条件が ${result.problems.length} 件欠けた (終了コード 1)`);
      ctx.stderr(rollback);
      return ExitCode.Violation;
    }

    ctx.stdout('作業の列 (書き直す段の作業。終了コード 0):');
    for (const item of result.work) {
      ctx.stdout(`WORK ${item.kind}: ${item.violations.length} 件`);
      for (const violation of item.violations) ctx.stdout(`  VIOLATION ${violation.file ?? ''} ${violation.message}`);
    }
    ctx.stdout(`OK docs-migrate: 完了条件 C1〜C5 を満たした。移した ${plan.moves.size} 件・消した ${plan.deletes.size} 件 (commit はしていない)`);
    ctx.stdout('NOTICE 決定の段: commit したあと、もう一度 docs-migrate を実行すると <年>/ 直下の ADR を状態のフォルダへ移す (根拠の表は --decisions-evidence)');
    return ExitCode.Ok;
  }

  /** 決定の段。移す段が空 (構成が新しい) のときだけ走る。作業ツリーが clean であることは、この段が確かめる */
  async #decisionStage(root: string, args: ReturnType<typeof parseArgs>, ctx: CommandContext, isDryRun: boolean): Promise<ExitCode> {
    const table = args.get('decisions-evidence');
    const evidenceRows: EvidenceRow[] = table === undefined ? [] : (JSON.parse(readFileSync(resolve(ctx.cwd, table), 'utf8')) as EvidenceRow[]);
    const outcome = await migrateDecisions({ root, igetaRoot: ctx.igetaRoot, evidenceRows, port: createGhPort(), today: isoDateInTokyo(new Date()), isDryRun });
    for (const line of outcome.lines) (outcome.exitCode === ExitCode.Ok ? ctx.stdout : ctx.stderr)(line);
    return outcome.exitCode;
  }
}
