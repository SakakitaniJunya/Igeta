// 決定の状態を変える変更の計画 (ADR-0013 決定 2・3)。accept・reject・supersede・amend が書く内容を、何も書かずに作る。
// 型は plan/types.ts、根拠の確かめは plan/confirm.ts。書くのは record.ts。

import { basename } from 'node:path';
import type { DecisionDoc, HistoryRow, NewHistoryRow } from '#decision/core';
import { DECISIONS_DIR, appendHistoryRow, decisionFingerprint, editFrontmatter, loadDecisions, originSlug } from '#decision/core';
import { loadIgetaConfig } from '#core/IgetaConfig.js';
import { dirtyProblem, gitRepoProblem } from '#generators/DocsMigrateRepo.js';
import { confirmMergedPull, confirmRejection } from './plan/confirm.js';
import type { Change, Context, RecordRequest, Step } from './plan/types.js';
import { cannotCheck, proceed, refuse } from './plan/types.js';

export type { Change, Context, DecisionVerb, RecordOutcome, RecordRequest, Step } from './plan/types.js';
export { cannotCheck, proceed, refuse } from './plan/types.js';

const SHORT_FINGERPRINT_LENGTH = 19;

export function findDecision(docs: readonly DecisionDoc[], target: string): Step<DecisionDoc> {
  const number = /^(?:ADR-)?0*(\d+)$/i.exec(target)?.[1];
  const matches = docs.filter((doc) => doc.id === target || (number !== undefined && Number(doc.number) === Number(number)));
  if (matches.length === 1 && matches[0] !== undefined) return proceed(matches[0]);
  return refuse(matches.length === 0 ? `ADR ${target} が見つからない` : `ADR ${target} が複数ある: ${matches.map((doc) => doc.path).join(' / ')}`);
}

export function prepare(request: RecordRequest): Step<Context> {
  const repoProblem = gitRepoProblem(request.root);
  if (repoProblem !== null) return cannotCheck(repoProblem);
  const dirty = dirtyProblem(request.root);
  if (dirty !== null) return refuse(dirty);
  const loaded = loadIgetaConfig(request.root);
  if ('violation' in loaded) return cannotCheck(loaded.violation.message);
  const slug = originSlug(request.root);
  if (!slug.ok) return cannotCheck(slug.reason);
  return proceed({ request, config: loaded.config.decisions, slug: slug.value, docs: loadDecisions(request.root) });
}

/** --by が approvers の名前にあり、その github を返す */

export const yearOf = (date: string): string => date.slice(0, 4);

export function row(fields: Omit<NewHistoryRow, 'memo'> & { readonly memo?: string }): NewHistoryRow {
  return { memo: '', ...fields };
}

function describeRow(newRow: NewHistoryRow): string {
  return `${newRow.date} ${newRow.event} ${newRow.before}→${newRow.after} ${newRow.by} ${newRow.evidence} ${newRow.fingerprint.slice(0, SHORT_FINGERPRINT_LENGTH)}`;
}

export function build(doc: DecisionDoc, args: { readonly newRow: NewHistoryRow; readonly folder: string; readonly frontmatter: Record<string, string | undefined> }): Change {
  const edit = (text: string): string => appendHistoryRow(editFrontmatter(text, args.frontmatter), args.newRow);
  const newPath = args.folder === '' ? doc.path : `${DECISIONS_DIR}/${args.folder}/${basename(doc.path)}`;
  const settings = Object.entries(args.frontmatter).map(([key, value]) => `${key}=${value ?? '(削除)'}`);
  return { doc, newPath, edit, appended: describeRow(args.newRow), settings };
}

export async function planAccept(context: Context, doc: DecisionDoc, allowedBefore: readonly string[] = ['proposed']): Promise<Step<Change[]>> {
  const { by, evidence } = context.request;
  if (!allowedBefore.includes(doc.status)) return refuse(`${doc.id}: ${doc.status} から accepted へは遷移できない (accept は ${allowedBefore.join('・')} だけ)`);
  const confirmed = await confirmMergedPull(context, doc, by, evidence ?? '');
  if (!confirmed.ok) return confirmed;
  const newRow = row({ date: confirmed.value.date, event: '承認', before: 'proposed', after: 'accepted', by: by ?? '', evidence: confirmed.value.url, commit: confirmed.value.commit, fingerprint: confirmed.value.fingerprint });
  return proceed([build(doc, { newRow, folder: `accepted/${yearOf(newRow.date)}`, frontmatter: { status: 'accepted', awaiting: undefined } })]);
}

async function planAmend(context: Context, doc: DecisionDoc): Promise<Step<Change[]>> {
  const { by, evidence } = context.request;
  if (doc.status !== 'accepted' && doc.status !== 'amended') return refuse(`${doc.id}: ${doc.status} は amend できない (accepted か amended だけ)`);
  const sealing = doc.rows.filter((candidate: HistoryRow) => ['承認', '改訂'].includes(candidate.event)).at(-1);
  const fingerprint = decisionFingerprint(context.request.root, doc.path, doc.text);
  if (sealing?.fingerprint === fingerprint) return refuse(`${doc.id}: 本文が最後の承認・改訂から変わっていない (amend するものが無い)`);
  const confirmed = await confirmMergedPull(context, doc, by, evidence ?? '');
  if (!confirmed.ok) return confirmed;
  const newRow = row({ date: confirmed.value.date, event: '改訂', before: doc.status, after: 'amended', by: by ?? '', evidence: confirmed.value.url, commit: confirmed.value.commit, fingerprint: confirmed.value.fingerprint });
  return proceed([build(doc, { newRow, folder: '', frontmatter: { status: 'amended' } })]);
}

async function planReject(context: Context, doc: DecisionDoc): Promise<Step<Change[]>> {
  if (doc.status !== 'proposed') return refuse(`${doc.id}: ${doc.status} から rejected へは遷移できない (reject は proposed だけ)`);
  const confirmed = await confirmRejection(context);
  if (!confirmed.ok) return confirmed;
  const fingerprint = decisionFingerprint(context.request.root, doc.path, doc.text);
  const newRow = row({ date: confirmed.value.date, event: '却下', before: 'proposed', after: 'rejected', by: context.request.by ?? '', evidence: confirmed.value.url, commit: '', fingerprint, memo: context.request.reason ?? '' });
  return proceed([build(doc, { newRow, folder: `rejected/${yearOf(newRow.date)}`, frontmatter: { status: 'rejected', awaiting: undefined } })]);
}

function planSupersede(context: Context, old: DecisionDoc): Step<Change[]> {
  const replacement = findDecision(context.docs, context.request.byAdr ?? '');
  if (!replacement.ok) return replacement;
  const next = replacement.value;
  if (next.status !== 'accepted' && next.status !== 'amended') return refuse(`${next.id}: 置く側は accepted か amended でなければならない (${next.status})`);
  if (old.status !== 'accepted' && old.status !== 'amended') return refuse(`${old.id}: ${old.status} から superseded へは遷移できない`);
  const approval = next.rows.filter((candidate: HistoryRow) => candidate.event === '承認').at(-1);
  const newRow = row({ date: context.request.today, event: '置換', before: old.status, after: 'superseded', by: approval?.by ?? '', evidence: next.id, commit: '', fingerprint: '' });
  const oldYear = old.path.split('/').at(-2) ?? yearOf(context.request.today);
  const retired = build(old, { newRow, folder: `retired/${oldYear}`, frontmatter: { status: 'superseded', superseded_by: next.id } });
  const supersedes = next.supersedes.includes(old.id) ? next.supersedes : [...next.supersedes, old.id];
  const listed = `[${supersedes.join(', ')}]`;
  const updatedNext: Change = { doc: next, newPath: next.path, edit: (text) => editFrontmatter(text, { supersedes: listed }), appended: '', settings: [`supersedes=${listed}`] };
  return proceed([retired, updatedNext]);
}

export async function plan(context: Context): Promise<Step<Change[]>> {
  const target = findDecision(context.docs, context.request.target);
  if (!target.ok) return target;
  switch (context.request.verb) {
    case 'accept':
      return planAccept(context, target.value);
    case 'reject':
      return planReject(context, target.value);
    case 'amend':
      return planAmend(context, target.value);
    case 'supersede':
      return planSupersede(context, target.value);
  }
}

