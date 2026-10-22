// 決定の状態を変える唯一の書き込み口 `recordDecision` (ADR-0013 決定 2)。accept・reject・supersede・amend の 4 動詞が通る。
// 手順: 全部を確かめる (遷移・approvers・gh・根拠 commit の本文指紋) → 書く内容を全部作る → 書く。書くのは一時ファイルからの
// rename で、失敗したら docs/ と書き換えた文書を書く前の状態に戻す。同じ repo への同時の記録は、ロックで後の 1 本を断る。

import { mkdirSync, readFileSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { DecisionDoc, HistoryRow, NewHistoryRow } from '#decision/core';
import {
  DECISIONS_DIR,
  appendHistoryRow,
  createGitCommitReader,
  decisionFingerprint,
  editFrontmatter,
  loadDecisions,
  originSlug,
  parseEvidenceUrl,
} from '#decision/core';
import { DocGraphCheck } from '../../../checks/DocGraphCheck.js';
import { ExitCode } from '../../../core/ExitCode.js';
import { loadIgetaConfig } from '../../../core/IgetaConfig.js';
import type { DecisionsConfig } from '../../../core/IgetaConfig.js';
import { rewriteLinksForMoves } from '../../../generators/DocsMigrateLinks.js';
import { dirtyProblem, gitOrNull, gitRepoProblem, trackedFiles } from '../../../generators/DocsMigrateRepo.js';
import type { GitHubPort } from './port.js';
import { snapshotTree, restoreTree } from './snapshot.js';

export type DecisionVerb = 'accept' | 'reject' | 'supersede' | 'amend';

export interface RecordRequest {
  readonly root: string;
  readonly igetaRoot: string;
  readonly verb: DecisionVerb;
  /** ADR の id か番号 (`0013`・`13`・`ADR-0013`) */
  readonly target: string;
  readonly by?: string;
  readonly evidence?: string;
  readonly reason?: string;
  /** supersede の、置いた方の ADR (id か番号) */
  readonly byAdr?: string;
  readonly isDryRun: boolean;
  readonly port: GitHubPort;
  /** 記録の日 (YYYY-MM-DD) */
  readonly today: string;
}

export interface RecordOutcome {
  readonly exitCode: ExitCode;
  readonly lines: readonly string[];
}

/** 1 つの文書の変更。newPath が path と違えば移動。edit は、リンクを書き換えた後の本文に履歴と frontmatter を重ねる */
interface Change {
  readonly doc: DecisionDoc;
  readonly newPath: string;
  readonly edit: (text: string) => string;
  readonly appended: string;
  readonly settings: readonly string[];
}

type Step<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly exitCode: ExitCode; readonly reason: string };
const proceed = <T>(value: T): Step<T> => ({ ok: true, value });
const refuse = (reason: string): Step<never> => ({ ok: false, exitCode: ExitCode.Violation, reason });
const cannotCheck = (reason: string): Step<never> => ({ ok: false, exitCode: ExitCode.CannotCheck, reason });

interface Context {
  readonly request: RecordRequest;
  readonly config: DecisionsConfig;
  readonly slug: string;
  readonly docs: readonly DecisionDoc[];
}

const LOCK_NAME = 'igeta-decision.lock';
const SHORT_FINGERPRINT_LENGTH = 19;

function findDecision(docs: readonly DecisionDoc[], target: string): Step<DecisionDoc> {
  const number = /^(?:ADR-)?0*(\d+)$/i.exec(target)?.[1];
  const matches = docs.filter((doc) => doc.id === target || (number !== undefined && Number(doc.number) === Number(number)));
  if (matches.length === 1 && matches[0] !== undefined) return proceed(matches[0]);
  return refuse(matches.length === 0 ? `ADR ${target} が見つからない` : `ADR ${target} が複数ある: ${matches.map((doc) => doc.path).join(' / ')}`);
}

function prepare(request: RecordRequest): Step<Context> {
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
function approverGithub(context: Context, by: string | undefined): Step<string> {
  const approver = context.config.approvers.find((candidate) => candidate.name === by);
  return approver === undefined ? refuse(`--by "${by ?? ''}" が .igeta.json の decisions.approvers の名前に無い`) : proceed(approver.github);
}

interface Confirmed {
  readonly commit: string;
  readonly date: string;
  readonly fingerprint: string;
  readonly url: string;
}

/** merge 済みの PR の、merge した人と、PR の commit のどれかに今の本文があること */
async function confirmMergedPull(context: Context, doc: DecisionDoc, by: string | undefined, evidence: string): Promise<Step<Confirmed>> {
  const url = parseEvidenceUrl(evidence);
  if (!url.ok) return refuse(url.reason);
  if (url.value.kind !== 'pull') return refuse(`根拠は merge 済みの PR の URL (${evidence})`);
  if (url.value.slug !== context.slug) return refuse(`根拠 ${evidence} は origin (${context.slug}) の repo ではない`);
  const github = approverGithub(context, by);
  if (!github.ok) return github;
  const number = Number(url.value.ref);
  const pull = await context.request.port.pull(context.slug, number);
  if (!pull.ok) return cannotCheck(pull.reason);
  if (pull.value.state !== 'merged') return refuse(`PR #${number} は merge されていない (${pull.value.state})`);
  if (pull.value.mergedBy !== github.value) return refuse(`PR #${number} を merge した人 (${pull.value.mergedBy ?? '不明'}) が --by "${by ?? ''}" の github (${github.value}) と違う`);
  const commits = await context.request.port.pullCommits(context.slug, number);
  if (!commits.ok) return cannotCheck(commits.reason);
  const candidates = [...new Set([pull.value.mergeCommit ?? '', ...[...commits.value].reverse()].filter((sha) => sha !== ''))];
  const found = findCommitWithBody(context, doc, candidates);
  if (!found.ok) return found;
  return proceed({ ...found.value, date: pull.value.mergedAt ?? context.request.today, url: evidence });
}

function findCommitWithBody(context: Context, doc: DecisionDoc, candidates: readonly string[]): Step<{ commit: string; fingerprint: string }> {
  const fingerprint = decisionFingerprint(context.request.root, doc.path, doc.text);
  const reader = createGitCommitReader(context.request.root);
  try {
    const reasons: string[] = [];
    for (const commit of candidates) {
      const found = reader.fingerprintAt(commit, doc.id);
      if (found.status === 'found' && found.fingerprint === fingerprint) return proceed({ commit, fingerprint });
      reasons.push(found.status === 'found' ? `${commit.slice(0, 12)}: 本文の指紋が今の本文と違う` : found.reason);
      if (found.status === 'unverifiable') return cannotCheck(found.reason);
    }
    return refuse(`PR の commit に、今の本文の ${doc.id} が無い (${reasons.join(' / ')})`);
  } finally {
    reader.dispose();
  }
}

const yearOf = (date: string): string => date.slice(0, 4);

function row(fields: Omit<NewHistoryRow, 'memo'> & { readonly memo?: string }): NewHistoryRow {
  return { memo: '', ...fields };
}

function describeRow(newRow: NewHistoryRow): string {
  return `${newRow.date} ${newRow.event} ${newRow.before}→${newRow.after} ${newRow.by} ${newRow.evidence} ${newRow.fingerprint.slice(0, SHORT_FINGERPRINT_LENGTH)}`;
}

function build(doc: DecisionDoc, args: { readonly newRow: NewHistoryRow; readonly folder: string; readonly frontmatter: Record<string, string | undefined> }): Change {
  const edit = (text: string): string => appendHistoryRow(editFrontmatter(text, args.frontmatter), args.newRow);
  const newPath = args.folder === '' ? doc.path : `${DECISIONS_DIR}/${args.folder}/${basename(doc.path)}`;
  const settings = Object.entries(args.frontmatter).map(([key, value]) => `${key}=${value ?? '(削除)'}`);
  return { doc, newPath, edit, appended: describeRow(args.newRow), settings };
}

async function planAccept(context: Context, doc: DecisionDoc): Promise<Step<Change[]>> {
  const { by, evidence } = context.request;
  if (doc.status !== 'proposed') return refuse(`${doc.id}: ${doc.status} から accepted へは遷移できない (accept は proposed だけ)`);
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

interface Closure {
  readonly isOpen: boolean;
  readonly who?: string;
  readonly date?: string;
}

async function closureOf(context: Context, url: { readonly kind: string; readonly ref: string }): Promise<Step<Closure>> {
  const number = Number(url.ref);
  const { port } = context.request;
  if (url.kind === 'pull') {
    const pull = await port.pull(context.slug, number);
    if (!pull.ok) return cannotCheck(pull.reason);
    const { state, mergedBy, closedBy, mergedAt } = pull.value;
    return proceed({ isOpen: state === 'open', who: state === 'merged' ? mergedBy : closedBy, date: mergedAt });
  }
  const issue = await port.issue(context.slug, number);
  return issue.ok ? proceed({ isOpen: issue.value.state === 'open', who: issue.value.closedBy }) : cannotCheck(issue.reason);
}

async function confirmRejection(context: Context): Promise<Step<{ url: string; date: string }>> {
  const { by, evidence = '' } = context.request;
  const github = approverGithub(context, by);
  if (!github.ok) return github;
  const url = parseEvidenceUrl(evidence);
  if (!url.ok) return refuse(url.reason);
  if (url.value.slug !== context.slug || url.value.kind === 'commit') return refuse(`却下の根拠は origin (${context.slug}) の PR か Issue の URL (${evidence})`);
  const closure = await closureOf(context, url.value);
  if (!closure.ok) return closure;
  if (closure.value.isOpen) return refuse(`${evidence} はまだ閉じていない`);
  if (closure.value.who !== github.value) return refuse(`${evidence} を閉じた・merge した人 (${closure.value.who ?? '不明'}) が --by の github (${github.value}) と違う`);
  return proceed({ url: evidence, date: closure.value.date ?? context.request.today });
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

async function plan(context: Context): Promise<Step<Change[]>> {
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

function describeChanges(changes: readonly Change[], rewritten: ReadonlyMap<string, string>, notices: readonly string[]): string[] {
  const lines: string[] = [];
  for (const change of changes) {
    if (change.newPath !== change.doc.path) lines.push(`MOVE ${change.doc.path} -> ${change.newPath}`);
    if (change.appended !== '') lines.push(`APPEND ${change.newPath} | ${change.appended}`);
    lines.push(`SET ${change.newPath} ${change.settings.join(' ')}`);
  }
  for (const path of rewritten.keys()) lines.push(`REWRITE ${path} (リンク)`);
  return [...lines, `REWRITE ${DECISIONS_DIR}/README.md (索引の再生成)`, ...notices];
}

function writeAtomically(root: string, path: string, content: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.igeta-tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, absolute);
}

const brokenLinks = (violations: readonly { readonly message: string }[]): string[] => violations.map((v) => v.message).filter((message) => message.includes('[link]'));

/** 書く: 内容と移動、リンク、索引の再生成。新しいリンク切れが残れば Error */
async function writeAll(request: RecordRequest, changes: readonly Change[], rewritten: ReadonlyMap<string, string>): Promise<void> {
  const ctx = { targetRoot: request.root, igetaRoot: request.igetaRoot };
  const baseline = new Set(brokenLinks(await new DocGraphCheck().run(ctx)));
  const changedPaths = new Set(changes.map((change) => change.doc.path));
  for (const [path, text] of rewritten) if (!changedPaths.has(path)) writeAtomically(request.root, path, text);
  for (const change of changes) {
    const body = change.edit(rewritten.get(change.doc.path) ?? change.doc.text);
    if (change.newPath !== change.doc.path) rmSync(join(request.root, change.doc.path));
    writeAtomically(request.root, change.newPath, body);
  }
  const written = await new DocGraphCheck({ write: true }).run(ctx);
  if (written.length > 0) throw new Error(`索引を作り直せない: ${written.map((v) => v.message).join(' / ')}`);
  const fresh = brokenLinks(await new DocGraphCheck().run(ctx)).filter((message) => !baseline.has(message));
  if (fresh.length > 0) throw new Error(`移動のあとに新しいリンク切れが残る: ${fresh.join(' / ')}`);
}

function acquireLock(root: string): Step<string> {
  const gitDir = gitOrNull(root, ['rev-parse', '--absolute-git-dir'])?.trim();
  if (gitDir === undefined || gitDir === '') return cannotCheck('git のディレクトリを読めない');
  const lock = join(gitDir, LOCK_NAME);
  try {
    mkdirSync(lock);
    return proceed(lock);
  } catch {
    return refuse(`別の decision-* が実行中 (${lock} がある。実行中でなければ消す)`);
  }
}

function collectTrackedMarkdown(root: string): Map<string, string> {
  const tracked = (trackedFiles(root) ?? []).filter((path) => path.endsWith('.md'));
  return new Map(tracked.map((path) => [path, readFileSync(join(root, path), 'utf8')]));
}

/** ADR の状態を 1 つ変える。確かめられなければ何も書かない */
export async function recordDecision(request: RecordRequest): Promise<RecordOutcome> {
  const prepared = prepare(request);
  if (!prepared.ok) return { exitCode: prepared.exitCode, lines: [`ERROR ${prepared.reason}`] };
  const planned = await plan(prepared.value);
  if (!planned.ok) return { exitCode: planned.exitCode, lines: [`ERROR ${planned.reason}`] };
  const changes = planned.value;
  const files = collectTrackedMarkdown(request.root);
  const moves = new Map(changes.filter((change) => change.newPath !== change.doc.path).map((change) => [change.doc.path, change.newPath]));
  const { rewritten, notices } = rewriteLinksForMoves(files, moves);
  const lines = describeChanges(changes, rewritten, notices);
  if (request.isDryRun) return { exitCode: ExitCode.Ok, lines };
  const lock = acquireLock(request.root);
  if (!lock.ok) return { exitCode: lock.exitCode, lines: [`ERROR ${lock.reason}`] };
  const snapshot = snapshotTree(request.root, [...files.keys()]);
  try {
    const stale = changes.find((change) => readFileSync(join(request.root, change.doc.path), 'utf8') !== change.doc.text);
    if (stale !== undefined) throw new Error(`${stale.doc.path} が、確かめている間に変わった (別の記録が先に書いた)`);
    await writeAll(request, changes, rewritten);
    return { exitCode: ExitCode.Ok, lines: [...lines, `OK decision-${request.verb}: ${changes.map((change) => change.newPath).join(' / ')}`] };
  } catch (error) {
    restoreTree(request.root, snapshot);
    return { exitCode: ExitCode.Violation, lines: [`ERROR ${error instanceof Error ? error.message : String(error)}`, '書く前の状態に戻した'] };
  } finally {
    rmdirSync(lock.value);
  }
}
