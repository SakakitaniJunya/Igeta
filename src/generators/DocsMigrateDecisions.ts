// docs-migrate の決定の段 (テスト仕様 12 の MG1〜MG3)。`person/decisions/<年>/` 直下の ADR を、状態に応じて状態のフォルダへ移し、
// 決定台帳の DEC・OPEN の表に列を足す。
//   根拠の表 (id・名前・URL) がある ADR      → decision-accept と同じ確かめ (gh・根拠 commit の本文指紋) で accepted/<年>/ へ
//   根拠が無い旧 accepted・旧 rejected        → 事象 差戻し で proposed/ へ (メモに旧い状態と日付、awaiting は approvers の先頭の名前)
//   旧 proposed                                → proposed/ へ (awaiting が無ければ approvers の先頭の名前)
//   旧 superseded・deprecated                  → 事象 移行前 の履歴を 1 行起こして retired/<年>/ へ (根拠は 移行前 (未記入))
// 根拠を作って承認済にしない。1 本でも確かめられなければ、全部書かずに止める。終わりに docs-check の決定の検査を 1 回かける。
// .igeta.json に decisions.approvers が無い repo は、何も変えず案内だけを出す (既存の repo を黙って動かさない)。

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DecisionDoc } from '#decision/core';
import { DECISIONS_DIR, editFrontmatter } from '#decision/core';
import type { Change, Context, GitHubPort, RecordOutcome, RecordRequest, Step } from '#decision/cli';
import { build, commitChanges, planAccept, prepare, proceed, refuse, row, yearOf } from '#decision/cli';
import { DecisionStatusCheck } from '../checks/DecisionStatusCheck.js';
import { ExitCode } from '../core/ExitCode.js';
import { loadIgetaConfig } from '../core/IgetaConfig.js';
import { migrateLedgerText } from './DocsMigrateLedger.js';

/** 根拠の表の 1 行 */
export interface EvidenceRow {
  readonly id: string;
  readonly by: string;
  readonly evidence: string;
}

export interface DecisionMigrationRequest {
  readonly root: string;
  readonly igetaRoot: string;
  readonly evidenceRows: readonly EvidenceRow[];
  readonly port: GitHubPort;
  /** 移行の日 (YYYY-MM-DD) */
  readonly today: string;
  readonly isDryRun: boolean;
}

const LEGACY_PATH = /^docs\/person\/decisions\/\d{4}\/[^/]+\.md$/;
const ACCEPTABLE = ['proposed', 'accepted', 'amended'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function sendBack(doc: DecisionDoc, today: string, owner: string): Change {
  const newRow = row({ date: today, event: '差戻し', before: doc.status === 'rejected' ? 'rejected' : 'accepted', after: 'proposed', by: '', evidence: '', commit: '', fingerprint: '', memo: `旧い状態 ${doc.status} (${doc.accepted || doc.created})` });
  return build(doc, { newRow, folder: 'proposed', frontmatter: { status: 'proposed', awaiting: owner } });
}

function recordBeforeMigration(doc: DecisionDoc): Step<Change> {
  const date = [doc.accepted, doc.created].find((candidate) => DATE.test(candidate));
  if (date === undefined) return refuse(`${doc.id}: 移行前の行の日付にする accepted か created (YYYY-MM-DD) が無い`);
  const newRow = row({ date, event: '移行前', before: '未記入', after: doc.status, by: '', evidence: '移行前 (未記入)', commit: '', fingerprint: '' });
  return proceed(build(doc, { newRow, folder: `retired/${yearOf(date)}`, frontmatter: { status: doc.status } }));
}

function keepProposed(doc: DecisionDoc, owner: string): Change {
  const missingOwner = doc.awaiting === '';
  return {
    doc,
    newPath: doc.path.replace(/decisions\/\d{4}\//, 'decisions/proposed/'),
    edit: (text) => (missingOwner ? editFrontmatter(text, { awaiting: owner }) : text),
    appended: '',
    settings: missingOwner ? [`awaiting=${owner}`] : ['status=proposed'],
  };
}

async function changeFor(context: Context, doc: DecisionDoc, evidence: EvidenceRow | undefined): Promise<Step<Change>> {
  const owner = context.config.approvers[0]?.name ?? '';
  if (evidence !== undefined && ACCEPTABLE.includes(doc.status)) {
    const request: RecordRequest = { ...context.request, by: evidence.by, evidence: evidence.evidence };
    const planned = await planAccept({ ...context, request }, doc, ACCEPTABLE);
    return planned.ok && planned.value[0] !== undefined ? proceed(planned.value[0]) : planned.ok ? refuse(`${doc.id}: 変更を作れない`) : planned;
  }
  if (['superseded', 'deprecated'].includes(doc.status)) return recordBeforeMigration(doc);
  if (doc.status === 'proposed') return proceed(keepProposed(doc, owner));
  if (['accepted', 'amended', 'rejected'].includes(doc.status)) return proceed(sendBack(doc, context.request.today, owner));
  return refuse(`${doc.id}: status: ${doc.status} は移行できない`);
}

/** 状態の列が無い DEC・OPEN の表を持つ決定台帳の変更 (MG3)。無ければ undefined */
function ledgerChange(root: string, owner: string): Change | undefined {
  const path = `${DECISIONS_DIR}/01-decisions.md`;
  if (!existsSync(join(root, path))) return undefined;
  const text = readFileSync(join(root, path), 'utf8');
  if (migrateLedgerText(text, owner) === text) return undefined;
  return { doc: { path, text }, newPath: path, edit: (current) => migrateLedgerText(current, owner), appended: '', settings: ['状態・根拠・持ち主・期限の列を足す'] };
}

/** `<年>/` 直下の ADR と決定台帳を移す。無ければ何も変えない (2 回目は何もしない) */
export async function migrateDecisions(request: DecisionMigrationRequest): Promise<RecordOutcome> {
  const loaded = loadIgetaConfig(request.root);
  if ('violation' in loaded) return { exitCode: ExitCode.CannotCheck, lines: [`ERROR ${loaded.violation.message}`] };
  if (loaded.config.decisions.approvers.length === 0) {
    return { exitCode: ExitCode.Ok, lines: ['NOTICE 決定の段: .igeta.json の decisions.approvers ({ name, github }) を書くと、<年>/ 直下の ADR を状態のフォルダへ移せる。今回は何も変えない'] };
  }
  const base: RecordRequest = { root: request.root, igetaRoot: request.igetaRoot, verb: 'accept', target: '', isDryRun: request.isDryRun, port: request.port, today: request.today };
  const prepared = prepare(base);
  if (!prepared.ok) return { exitCode: prepared.exitCode, lines: [`ERROR ${prepared.reason}`] };
  const legacy = prepared.value.docs.filter((doc) => LEGACY_PATH.test(doc.path));
  const ledger = ledgerChange(request.root, prepared.value.config.approvers[0]?.name ?? '');
  if (legacy.length === 0 && ledger === undefined) return { exitCode: ExitCode.Ok, lines: ['決定の段: <年>/ 直下に ADR は無く、決定台帳も移行済み。何も変えない'] };
  const changes: Change[] = ledger === undefined ? [] : [ledger];
  for (const doc of legacy) {
    const change = await changeFor(prepared.value, doc, request.evidenceRows.find((candidate) => candidate.id === doc.id));
    if (!change.ok) return { exitCode: change.exitCode, lines: [`ERROR ${change.reason}`, '何も書いていない'] };
    changes.push(change.value);
  }
  const verify = async (): Promise<void> => {
    const violations = new DecisionStatusCheck({ now: () => new Date(`${request.today}T00:00:00Z`) }).run({ targetRoot: request.root, igetaRoot: request.igetaRoot });
    if (violations.length > 0) throw new Error(`移行のあとの docs-check の決定の検査が落ちた: ${violations.map((v) => `${v.file ?? ''} ${v.message}`).join(' / ')}`);
  };
  return commitChanges({ root: request.root, igetaRoot: request.igetaRoot, label: 'docs-migrate (決定の段)', changes, isDryRun: request.isDryRun, verify });
}
