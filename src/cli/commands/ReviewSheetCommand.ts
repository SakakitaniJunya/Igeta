import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ExitCode } from '../../core/ExitCode.js';
import { DiffTraceModule } from '../../generators/DiffTraceModule.js';
import { extractNearMissQualifiedIds, extractQualifiedIds, ReviewSheetModule } from '../../generators/ReviewSheetModule.js';
import { ArgParseError, parseArgs } from '../Args.js';
import type { CommandContext } from '../Command.js';
import { Command } from '../Command.js';

/**
 * 人間レビュー層 (docs/00-map.md・docs/01-decisions.md) を前提に、指定した修飾 ID の
 * 要件文・受入条件・関連 DEC/OPEN・下流の設計書を 1 枚の Markdown へ展開して stdout に出す。
 * --diff <base>..<head> なら「変更ファイル → タスク → FN → REQ」を辿る (S4)。
 * Spec: templates/docs/guides/03-human-review.md
 */
export class ReviewSheetCommand extends Command {
  readonly name = 'review-sheet';
  readonly summary = '指定した修飾 ID のレビューシートを 1 枚の Markdown で出す';
  override readonly usage = [
    '  igeta review-sheet <doc-id>/REQ-nnn [<doc-id>/REQ-nnn ...] [--root <dir>]',
    '  igeta review-sheet --pr-body <file> [--root <dir>]',
    '  igeta review-sheet --diff <base>..<head> [--pr-body <file>] [--root <dir>]',
    '',
    '  --root <dir>       対象リポジトリ (既定: カレントディレクトリ)',
    '  --pr-body <file>   PR 本文などから修飾 ID (<doc-id>/PREFIX-nnn) を抜き出して対象に加える',
    '  --diff <range>     変更ファイル → タスク → FN → REQ を辿る (git diff --name-only <range>)。',
    '                      --pr-body も渡すと申告 REQ との不一致を見る',
  ];

  protected readonly argSpec = { valueOptions: ['root', 'pr-body', 'diff'] };

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, { valueOptions: this.argSpec.valueOptions });
    const targetRoot = resolve(args.get('root') ?? ctx.cwd);
    const prBodyPath = args.get('pr-body');
    const prBody = prBodyPath === undefined ? null : readFileSync(resolve(prBodyPath), 'utf8');
    if (prBody !== null) {
      // 大文字 doc-id 等の近似表記は黙って無視せず警告する (non-blocking N4)
      for (const nearMiss of extractNearMissQualifiedIds(prBody)) {
        ctx.stderr(`WARN --pr-body に修飾 ID の近似表記がある (無視した): ${nearMiss}`);
      }
    }

    const diffRange = args.get('diff');
    if (diffRange !== undefined) {
      return this.#runDiff(targetRoot, diffRange, prBody, ctx);
    }

    const ids = new Set(args.positional);
    if (prBody !== null) for (const id of extractQualifiedIds(prBody)) ids.add(id);
    if (ids.size === 0) {
      throw new ArgParseError('対象 ID が 1 件も無い。<doc-id>/PREFIX-nnn を渡すか --pr-body / --diff で抜き出す');
    }

    const module = new ReviewSheetModule({ targetRoot });
    const result = module.generate([...ids]);

    ctx.stdout(result.markdown);
    if (result.unresolvedCount > 0) {
      ctx.stderr(`\n${result.unresolvedCount} 件の ID が解決できなかった (上の Markdown を参照)`);
      return ExitCode.Violation;
    }
    return ExitCode.Ok;
  }

  #runDiff(targetRoot: string, diffRange: string, prBody: string | null, ctx: CommandContext): ExitCode {
    let changedFiles: string[];
    try {
      const output = execFileSync('git', ['-C', targetRoot, 'diff', '--name-only', diffRange], { encoding: 'utf8' });
      changedFiles = output.split('\n').map((line) => line.trim()).filter((line) => line !== '');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ArgParseError(`git diff --name-only ${diffRange} に失敗した: ${message}`);
    }
    const declaredReqIds = prBody === null ? [] : extractQualifiedIds(prBody);
    const result = new DiffTraceModule({ targetRoot }).trace(changedFiles, declaredReqIds);

    ctx.stdout(result.markdown);
    // 裏取りできていないのに exit 0 (緑) にしない (原則 8。main 決定 A2 / code-reviewer round 3 C3)
    if (result.cannotCheck) return ExitCode.CannotCheck;
    if (result.missingFromDeclaration.length > 0) {
      ctx.stderr(`\n申告に無いが影響する REQ が ${result.missingFromDeclaration.length} 件ある (上の Markdown §(a) を参照)`);
      return ExitCode.Violation;
    }
    return ExitCode.Ok;
  }
}
