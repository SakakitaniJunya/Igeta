// `igeta decision-pending` — 承認待ち (proposed) の ADR を、経過日数の降順で洗い出す。読むだけで何も書かない (テスト仕様 10)。
// 実行すべき decision-accept の候補は出すが、書かない (実行時に gh で確かめる)。

import { resolve } from 'node:path';
import type { DecisionDoc } from '#decision/core';
import { daysBetween, firstSeen, loadDecisions, originSlug } from '#decision/core';
import { ExitCode } from '../../../core/ExitCode.js';
import { loadIgetaConfig } from '../../../core/IgetaConfig.js';
import { parseArgs } from '../../Args.js';
import type { CommandContext } from '../../Command.js';
import { Command } from '../../Command.js';

/** 出力の末尾に必ず出す、機械で確かめられない限界 (ADR-0013 の残余リスク) */
export const PENDING_LIMIT_NOTE = 'merge した人が人かは確かめられない (AI と同じ GitHub アカウントの場合)。記録の PR は人が読んで merge する';

export interface PendingEntry {
  readonly number: string;
  readonly id: string;
  readonly title: string;
  readonly awaiting: string;
  readonly due: string;
  readonly waitedDays: number;
  /** 経過日数を git の初めて現れた日から数えたか (false なら created から) */
  readonly isFromGit: boolean;
  readonly isStale: boolean;
  /** 初めて現れた commit の PR (`#12`)。件名に無ければ空 */
  readonly pull: string;
  readonly candidate: string;
}

function entryOf(doc: DecisionDoc, env: { readonly root: string; readonly today: string; readonly staleDays: number; readonly slug: string; readonly fallbackBy: string }): PendingEntry {
  const seen = firstSeen(env.root, doc.path);
  const since = seen.ok ? seen.value.date : doc.created || env.today;
  const pullNumber = seen.ok ? /\(#(\d+)\)/.exec(seen.value.subject)?.[1] : undefined;
  const by = doc.awaiting || env.fallbackBy;
  const evidence = pullNumber !== undefined && env.slug !== '' ? `https://github.com/${env.slug}/pull/${pullNumber}` : '<merge した PR の URL>';
  const waitedDays = daysBetween(since, env.today);
  return {
    number: doc.number,
    id: doc.id,
    title: doc.title,
    awaiting: doc.awaiting,
    due: doc.due,
    waitedDays,
    isFromGit: seen.ok,
    isStale: waitedDays > env.staleDays || (doc.due !== '' && doc.due < env.today),
    pull: pullNumber === undefined ? '' : `#${pullNumber}`,
    candidate: `igeta decision-accept ${doc.number} --by "${by}" --evidence ${evidence}`,
  };
}

/** proposed の ADR を、経過日数の降順 (同じなら番号順) で返す */
export function collectPending(args: { readonly root: string; readonly today: string; readonly staleDays?: number }): { readonly entries: readonly PendingEntry[]; readonly problem?: string } {
  const loaded = loadIgetaConfig(args.root);
  if ('violation' in loaded) return { entries: [], problem: loaded.violation.message };
  const slug = originSlug(args.root);
  const env = {
    root: args.root,
    today: args.today,
    staleDays: args.staleDays ?? loaded.config.decisions.staleDays,
    slug: slug.ok ? slug.value : '',
    fallbackBy: loaded.config.decisions.approvers[0]?.name ?? '<承認する人の名前>',
  };
  const entries = loadDecisions(args.root)
    .filter((doc) => doc.status === 'proposed')
    .map((doc) => entryOf(doc, env))
    .sort((a, b) => b.waitedDays - a.waitedDays || a.number.localeCompare(b.number));
  return { entries };
}

function lineOf(entry: PendingEntry): string {
  const staleMark = entry.isStale ? '停滞 ' : '';
  const since = entry.isFromGit ? '' : ' (created から)';
  return `${staleMark}${entry.number} ${entry.title} | 持ち主 ${entry.awaiting || '—'} | 期限 ${entry.due || '—'} | ${entry.waitedDays} 日待ち${since} | PR ${entry.pull || '—'} | ${entry.candidate}`;
}

const todayOf = (): string => new Date().toISOString().slice(0, 10);

export class DecisionPendingCommand extends Command {
  readonly name = 'decision-pending';
  readonly summary = '承認待ちの ADR を、経過日数の降順で洗い出す (読むだけ)。実行すべき decision-accept の候補を添える';
  override readonly usage = [
    '  igeta decision-pending [--json] [--stale-days N] [--root <dir>]',
    '',
    '  --json          JSON で出す',
    '  --stale-days N  この日数を超えた行に「停滞」を付ける (既定: .igeta.json の decisions.staleDays、無ければ 14)',
  ];

  protected readonly argSpec = { valueOptions: ['root', 'stale-days'], boolOptions: ['json'] };

  override async run(argv: readonly string[], ctx: CommandContext): Promise<ExitCode> {
    const args = parseArgs(argv, this.argSpec);
    const staleDays = args.get('stale-days') === undefined ? undefined : Number(args.get('stale-days'));
    if (staleDays !== undefined && (!Number.isInteger(staleDays) || staleDays < 0)) {
      ctx.stderr('ERROR --stale-days は 0 以上の整数');
      return ExitCode.CannotCheck;
    }
    const { entries, problem } = collectPending({ root: resolve(ctx.cwd, args.get('root') ?? '.'), today: todayOf(), staleDays });
    if (problem !== undefined) {
      ctx.stderr(`ERROR ${problem}`);
      return ExitCode.CannotCheck;
    }
    if (args.has('json')) {
      ctx.stdout(JSON.stringify({ pending: entries, note: PENDING_LIMIT_NOTE }, null, 2));
    } else {
      for (const entry of entries) ctx.stdout(lineOf(entry));
      if (entries.length === 0) ctx.stdout('承認待ちの ADR は無い');
      ctx.stdout(`NOTE ${PENDING_LIMIT_NOTE}`);
    }
    return ExitCode.Ok;
  }
}
