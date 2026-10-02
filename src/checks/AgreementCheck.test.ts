// node --test dist/checks/AgreementCheck.test.js
// 合意台帳の一連 (記録 → 承認 → 検査) を、モジュールを直接呼んで確かめる。
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgreementCheck } from './AgreementCheck.js';
import { LEDGER_FILENAME, ledgerPathFor, readLedger } from '../core/AgreementLedger.js';
import { ExitCode } from '../core/ExitCode.js';
import { Report } from '../core/Report.js';
import { buildSourceIndex } from '../core/SourceResolver.js';
import { parseManifest } from '../export/Manifest.js';
import { approveAgreement } from '../generators/AgreementApproveModule.js';
import { appendAgreementRecord, prepareAgreementRecord } from '../generators/AgreementRecordModule.js';
import { rebaseFingerprints } from '../generators/FingerprintRebaseModule.js';
import {
  ANCHOR_NO_SOURCE, ANCHOR_ROW, ANCHOR_SECTION, MANIFEST, POLICY_DOC, ROW_FROM, SECTION_FROM, SUBMISSION as LINKED_SUBMISSION, TERMS_DOC,
  chapterDoc, cleanupWorkspaces, makeLegacyRepo, makeRoot as makeLinkedRoot, parseLedgerLines, relocate, reservationDoc,
} from '../generators/rebaseFixture.test-support.js';
import { accept } from '../generators/ProvenanceAcceptModule.js';
import { capture } from '../generators/ProvenanceCaptureModule.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});
after(cleanupWorkspaces);

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-agreement-'));
  workspaces.push(root);
  return root;
}

function write(root: string, rel: string, content: string): string {
  const target = join(root, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

const SUBMISSION = 'docs/delivery/design-document';
const CHAPTER = `${SUBMISSION}/01-reservation.md`;

function requirements(deadline = '30 日前', note = '備考 A'): string {
  return [
    '---', 'id: reservation-flow', 'kind: requirements', 'status: fixed', 'depends_on: []', '---', '',
    '# 要件', '',
    '## 1. 機能要件', '',
    '| ID | 要件 |', '|---|---|',
    `| REQ-101 | 予約は ${deadline}まで受け付ける |`,
    '',
    '## 2. 補足', '',
    '| ID | 補足 |', '|---|---|',
    `| REQ-301 | ${note} |`,
    '',
  ].join('\n');
}

function chapter(body = '予約は 30 日前まで受け付けます。'): string {
  return [
    '---', 'id: chapter-reservation', 'kind: delivery-chapter', 'status: draft', 'depends_on: []', '---', '',
    '# 予約', '',
    '## 1. 予約の受付', '', body, '',
    '## 2. 補足', '', '補足です。', '',
    '## 関連', '', '| 区分 | 文書 |', '|---|---|', '| 上流 | 社内の文書 |', '',
  ].join('\n');
}

function manifestJson(version = '1.0'): string {
  return JSON.stringify({
    title: 'サンプル設計書', issuer: 'サンプル開発株式会社', version, date: '2026-01-10',
    chapters: ['01-reservation.md'], output: 'out/design.pdf',
  });
}

interface Fixture {
  readonly root: string;
  readonly submissionDir: string;
  readonly manifestPath: string;
}

/** 正本 + 章 + manifest を作り、章の 2 節に由来を付けて承認まで済ませる。 */
function makeFixture(options: { provenance?: boolean } = {}): Fixture {
  const root = makeRoot();
  write(root, 'docs/requirements.md', requirements());
  const chapterPath = write(root, CHAPTER, chapter());
  const manifestPath = write(root, `${SUBMISSION}/deliverable.json`, manifestJson());
  if (options.provenance !== false) {
    const sourceIndex = buildSourceIndex(root, join(root, 'docs'));
    capture({ chapterAbsPath: chapterPath, targetRoot: root, anchor: '1. 予約の受付', source: { kind: 'from', id: 'reservation-flow/REQ-101' }, by: 'agent:writer', sourceIndex });
    capture({ chapterAbsPath: chapterPath, targetRoot: root, anchor: '2. 補足', source: { kind: 'from', id: 'reservation-flow/REQ-301' }, by: 'agent:writer', sourceIndex });
    accept({ targetRoot: root, chapterAbsPath: chapterPath, chapterRelPath: CHAPTER, target: { kind: 'all' }, by: 'reviewer@example.com', sourceIndex });
  }
  return { root, submissionDir: join(root, SUBMISSION), manifestPath };
}

function record(fx: Fixture): ReturnType<typeof prepareAgreementRecord> {
  const manifest = parseManifest(fx.manifestPath);
  const prepared = prepareAgreementRecord({ manifest, targetRoot: fx.root, docsDir: join(fx.root, 'docs') });
  if (prepared.kind === 'ok') assert.equal(appendAgreementRecord(manifest, prepared.event), null);
  return prepared;
}

function runCheck(fx: Fixture, options: { submissionDir?: string; configPath?: string } = {}): { report: Report; warnings: readonly string[] } {
  const check = new AgreementCheck(options);
  const report = new Report();
  report.addAll(check.run({ targetRoot: fx.root, igetaRoot: fx.root }));
  return { report, warnings: check.warnings };
}

describe('合意台帳: 記録 (export --record-agreement)', () => {
  it('正常系: 由来が通っていれば、版・章の指紋・正本の指紋を 1 行記録する', () => {
    const fx = makeFixture();
    const prepared = record(fx);
    assert.equal(prepared.kind, 'ok');
    const ledger = readLedger(fx.submissionDir);
    assert.equal(ledger.kind, 'ok');
    if (ledger.kind !== 'ok') return;
    assert.equal(ledger.events.length, 1);
    const event = ledger.events[0];
    assert.ok(event !== undefined && event.event === 'export');
    if (event === undefined || event.event !== 'export') return;
    assert.equal(event.version, '1.0');
    assert.equal(event.chapters.length, 1);
    assert.deepEqual(event.chapters[0]?.sources.map((s) => s.from), ['reservation-flow/REQ-101', 'reservation-flow/REQ-301']);
    assert.match(event.chapters[0]?.chapterFingerprint ?? '', /^sha256:/);
  });

  it('拒否: 由来の無い章があると記録しない (台帳を作らない)', () => {
    const fx = makeFixture({ provenance: false });
    const prepared = record(fx);
    assert.equal(prepared.kind, 'rejected');
    assert.equal(existsSync(ledgerPathFor(fx.submissionDir)), false);
  });

  it('拒否: 由来が古い (正本が変わった) 章があると記録しない', () => {
    const fx = makeFixture();
    write(fx.root, 'docs/requirements.md', requirements('60 日前'));
    const prepared = record(fx);
    assert.equal(prepared.kind, 'rejected');
    if (prepared.kind !== 'rejected') return;
    assert.ok(prepared.violations.some((v) => v.message.includes('stale')));
    assert.equal(existsSync(ledgerPathFor(fx.submissionDir)), false);
  });

  it('拒否: 同じ版を 2 回は記録しない', () => {
    const fx = makeFixture();
    assert.equal(record(fx).kind, 'ok');
    const second = record(fx);
    assert.equal(second.kind, 'rejected');
    const ledger = readLedger(fx.submissionDir);
    assert.ok(ledger.kind === 'ok' && ledger.events.length === 1);
  });

  it('検査不能: 壊れた行のある台帳には記録しない', () => {
    const fx = makeFixture();
    write(fx.root, `${SUBMISSION}/${LEDGER_FILENAME}`, '{"event":"export"\n');
    const prepared = record(fx);
    assert.equal(prepared.kind, 'rejected');
    if (prepared.kind !== 'rejected') return;
    assert.equal(prepared.violations[0]?.severity, 'cannot-check');
  });

  it('検査不能: 末尾が改行で終わっていない台帳には追記しない', () => {
    const fx = makeFixture();
    assert.equal(record(fx).kind, 'ok');
    const path = ledgerPathFor(fx.submissionDir);
    writeFileSync(path, readFileSync(path, 'utf8').replace(/\n$/, ''));
    const result = approveAgreement({ submissionDir: fx.submissionDir, version: '1.0', by: '発注側の責任者' });
    assert.equal(result.kind, 'rejected');
    if (result.kind !== 'rejected') return;
    assert.equal(result.violation.severity, 'cannot-check');
    assert.equal(readFileSync(path, 'utf8').split('\n').length, 1);
  });
});

describe('合意台帳: 承認 (agreement-approve)', () => {
  it('正常系: 記録済みの版を承認できる', () => {
    const fx = makeFixture();
    record(fx);
    const result = approveAgreement({ submissionDir: fx.submissionDir, version: '1.0', by: ' 発注側の責任者 ', note: '打合せで確認', now: new Date('2026-01-12T00:00:00Z') });
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.equal(result.event.approvedBy, '発注側の責任者');
    assert.equal(result.event.approvedAt, '2026-01-12');
    assert.equal(result.event.note, '打合せで確認');
  });

  it('検査不能: 台帳が無い', () => {
    const fx = makeFixture();
    const result = approveAgreement({ submissionDir: fx.submissionDir, version: '1.0', by: '発注側の責任者' });
    assert.ok(result.kind === 'rejected' && result.violation.severity === 'cannot-check');
  });

  it('検査不能: 記録の無い版は承認できない', () => {
    const fx = makeFixture();
    record(fx);
    const result = approveAgreement({ submissionDir: fx.submissionDir, version: '9.9', by: '発注側の責任者' });
    assert.ok(result.kind === 'rejected' && result.violation.severity === 'cannot-check');
  });

  it('検査不能: 承認者が空白だけ', () => {
    const fx = makeFixture();
    record(fx);
    const result = approveAgreement({ submissionDir: fx.submissionDir, version: '1.0', by: '   ' });
    assert.ok(result.kind === 'rejected' && result.violation.severity === 'cannot-check');
  });

  it('違反: 同じ版の承認を 2 回は記録しない', () => {
    const fx = makeFixture();
    record(fx);
    assert.equal(approveAgreement({ submissionDir: fx.submissionDir, version: '1.0', by: '発注側の責任者' }).kind, 'ok');
    const second = approveAgreement({ submissionDir: fx.submissionDir, version: '1.0', by: '別の承認者' });
    assert.ok(second.kind === 'rejected' && second.violation.severity === 'violation');
  });

  it('正常系: 承認の後に提出した新しい版は承認できる', () => {
    const fx = makeFixture();
    record(fx);
    assert.equal(approveAgreement({ submissionDir: fx.submissionDir, version: '1.0', by: '発注側の責任者' }).kind, 'ok');
    write(fx.root, `${SUBMISSION}/deliverable.json`, manifestJson('2.0'));
    record(fx);
    const result = approveAgreement({ submissionDir: fx.submissionDir, version: '2.0', by: '発注側の責任者' });
    assert.equal(result.kind, 'ok');
  });

  it('違反: 最後に承認された版より前に提出された版は承認できない (基準は後戻りしない)', () => {
    const fx = makeFixture();
    record(fx);
    write(fx.root, `${SUBMISSION}/deliverable.json`, manifestJson('2.0'));
    record(fx);
    assert.equal(approveAgreement({ submissionDir: fx.submissionDir, version: '2.0', by: '発注側の責任者' }).kind, 'ok');
    const result = approveAgreement({ submissionDir: fx.submissionDir, version: '1.0', by: '発注側の責任者' });
    assert.ok(result.kind === 'rejected' && result.violation.severity === 'violation');
    if (result.kind !== 'rejected') return;
    assert.match(result.violation.message, /基準は後の提出にだけ進む/);
    // 台帳の基準 (最後の承認) が 2.0 のまま変わっていないことを確かめる
    const ledger = readLedger(fx.submissionDir);
    assert.ok(ledger.kind === 'ok');
    if (ledger.kind !== 'ok') return;
    const last = ledger.events.findLast((e) => e.event === 'approve');
    assert.ok(last !== undefined && last.event === 'approve' && last.targetVersion === '2.0');
  });
});

describe('AgreementCheck', () => {
  const approved = (): Fixture => {
    const fx = makeFixture();
    record(fx);
    assert.equal(approveAgreement({ submissionDir: fx.submissionDir, version: '1.0', by: '発注側の責任者' }).kind, 'ok');
    return fx;
  };

  it('正常系: 台帳が 1 つも無い既存案件は赤くしない', () => {
    const fx = makeFixture();
    const { report, warnings } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.deepEqual(warnings, []);
  });

  it('正常系: docs が無い repo でも落ちない', () => {
    const root = makeRoot();
    const { report } = runCheck({ root, submissionDir: root, manifestPath: '' });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('正常系: 承認された版が無ければ、その旨を出して Ok', () => {
    const fx = makeFixture();
    record(fx);
    const { report, warnings } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.ok(warnings.some((w) => w.includes('承認された版がまだ無い')));
  });

  it('正常系: 承認の後に何も変えていなければ Ok', () => {
    const fx = approved();
    const { report, warnings } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.deepEqual(warnings, []);
  });

  it('正常系: 正本の整形だけの変更 (表の列幅) では何も出さない', () => {
    const fx = approved();
    write(fx.root, 'docs/requirements.md', requirements().replace('| REQ-101 | 予約は', '| REQ-101   |   予約は'));
    const { report, warnings } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.deepEqual(warnings, []);
  });

  it('違反: 承認の後に、規則に当たる正本 (既定は requirements) を変えると再合意が要る', () => {
    const fx = approved();
    write(fx.root, 'docs/requirements.md', requirements('60 日前'));
    const { report } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /再合意が要る.*reservation-flow\/REQ-101.*docs\/requirements\.md:\d+/);
    assert.doesNotMatch(report.format(), /REQ-301/);
  });

  it('通知のみ: 規則の節に当たらない変更は違反にせず、警告に出す', () => {
    const fx = approved();
    const configPath = write(fx.root, '.igeta.json', JSON.stringify({ reagreementRules: [{ kind: 'requirements', section: '機能要件' }] }));
    write(fx.root, 'docs/requirements.md', requirements('30 日前', '備考 B'));
    const { report, warnings } = runCheck(fx, { configPath });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.ok(warnings.some((w) => w.includes('通知のみ') && w.includes('REQ-301')), warnings.join('\n'));
  });

  it('違反: 規則の節 (番号なしで指定) に当たる変更は再合意が要る', () => {
    const fx = approved();
    const configPath = write(fx.root, '.igeta.json', JSON.stringify({ reagreementRules: [{ kind: 'requirements', section: '機能要件' }] }));
    write(fx.root, 'docs/requirements.md', requirements('60 日前'));
    const { report } = runCheck(fx, { configPath });
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
  });

  it('違反: 章の本文だけを変えた場合も再合意が要る', () => {
    const fx = approved();
    write(fx.root, CHAPTER, chapter('予約は 60 日前まで受け付けます。'));
    const { report } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /章の本文が承認した版 1\.0 から変わった/);
  });

  it('正常系: 提出物に出ない節 (関連) だけを変えても何も出さない', () => {
    const fx = approved();
    write(fx.root, CHAPTER, chapter().replace('| 上流 | 社内の文書 |', '| 上流 | 別の社内の文書 |'));
    const { report } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('違反: 承認した版にあった章が無くなった', () => {
    const fx = approved();
    rmSync(join(fx.root, CHAPTER));
    const { report } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /章が無い/);
  });

  it('違反: 由来が指す正本の行が無くなった', () => {
    const fx = approved();
    write(fx.root, 'docs/requirements.md', requirements().replace(/\| REQ-301 \|.*\n/, ''));
    const { report } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /正本が無くなった.*REQ-301/);
  });

  it('基準は最後に承認された版: 新しい版を提出しただけ (未承認) では基準が変わらない', () => {
    const fx = approved();
    write(fx.root, CHAPTER, chapter('予約は 30 日前まで受け付けます。詳しくは窓口へ。'));
    write(fx.root, `${SUBMISSION}/deliverable.json`, manifestJson('1.1'));
    assert.equal(record(fx).kind, 'ok');
    const before = runCheck(fx);
    assert.equal(before.report.exitCode, ExitCode.Violation, '未承認の 1.1 は基準にならない');
    assert.equal(approveAgreement({ submissionDir: fx.submissionDir, version: '1.1', by: '発注側の責任者' }).kind, 'ok');
    const afterApprove = runCheck(fx);
    assert.equal(afterApprove.report.exitCode, ExitCode.Ok, afterApprove.report.format());
  });

  it('基準は提出順で選ぶ: 承認と提出が交差した台帳でも、基準が過去へ戻らない', () => {
    const fx = makeFixture();
    record(fx); // 1.0 (30 日前) を記録
    write(fx.root, CHAPTER, chapter('予約は 60 日前まで受け付けます。'));
    write(fx.root, `${SUBMISSION}/deliverable.json`, manifestJson('2.0'));
    assert.equal(record(fx).kind, 'ok'); // 2.0 (60 日前) を記録
    // 承認ガード導入前の台帳を再現: 新しい版 2.0 の承認の後に、古い版 1.0 の承認が追記されている
    const ledgerPath = ledgerPathFor(fx.submissionDir);
    appendFileSync(ledgerPath, `${JSON.stringify({ event: 'approve', targetVersion: '2.0', approvedBy: 'x', approvedAt: '2026-01-12' })}\n`);
    appendFileSync(ledgerPath, `${JSON.stringify({ event: 'approve', targetVersion: '1.0', approvedBy: 'x', approvedAt: '2026-01-13' })}\n`);
    // 基準は「最後の承認 1.0」ではなく「承認済みのうち提出が最も後の 2.0」→ 本文 60 日前と一致して Ok
    const { report } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('検査不能: 台帳の chapters[].file が提出物のディレクトリの外を指す', () => {
    const fx = makeFixture();
    write(fx.root, `${SUBMISSION}/${LEDGER_FILENAME}`, [
      JSON.stringify({ event: 'export', version: '1.0', date: '2026-01-10', manifest: 'deliverable.json', omitSections: [], chapters: [{ file: '../../requirements.md', chapterFingerprint: 'sha256:0', sources: [] }] }),
      JSON.stringify({ event: 'approve', targetVersion: '1.0', approvedBy: 'x', approvedAt: '2026-01-12' }),
      '',
    ].join('\n'));
    const { report } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
    assert.match(report.format(), /外を指している/);
  });

  it('検査不能: 章が symlink で提出物のディレクトリの外を指す', () => {
    const fx = makeFixture();
    const outside = write(fx.root, 'docs/outside.md', '# 外の文書\n');
    const link = join(fx.submissionDir, 'linked.md');
    rmSync(link, { force: true });
    symlinkSync(outside, link);
    write(fx.root, `${SUBMISSION}/${LEDGER_FILENAME}`, [
      JSON.stringify({ event: 'export', version: '1.0', date: '2026-01-10', manifest: 'deliverable.json', omitSections: [], chapters: [{ file: 'linked.md', chapterFingerprint: 'sha256:0', sources: [] }] }),
      JSON.stringify({ event: 'approve', targetVersion: '1.0', approvedBy: 'x', approvedAt: '2026-01-12' }),
      '',
    ].join('\n'));
    const { report } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
    assert.match(report.format(), /外を指している/);
  });

  it('検査不能: 台帳に壊れた行がある (黙って読み飛ばさない)', () => {
    const fx = approved();
    appendFileSync(ledgerPathFor(fx.submissionDir), 'これは JSON ではない\n');
    const { report } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
  });

  it('検査不能: 空のオブジェクトの行 (event が無い)', () => {
    const fx = approved();
    appendFileSync(ledgerPathFor(fx.submissionDir), '{}\n');
    const { report } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
  });

  it('[ADR-0006 決定 7] 手で source-move の行を足した台帳は、検査不能にする (付け替えを辿らない)', () => {
    const fx = approved();
    // 行 REQ-101 を別の文書へ移した repo に、合わせて手で書いた行。辿れば Ok になる状態でも、辿らずに検査不能にする
    write(fx.root, 'docs/requirements.md', requirements().replace(/\| REQ-101 \|.*\n/, ''));
    write(fx.root, 'docs/requirements-2.md', [
      '---', 'id: reservation-flow-2', 'kind: requirements', 'status: fixed', 'depends_on: []', '---', '',
      '# 要件 (分割)', '', '| REQ-101 | 予約は 30 日前まで受け付ける |', '',
    ].join('\n'));
    appendFileSync(
      ledgerPathFor(fx.submissionDir),
      `${JSON.stringify({ event: 'source-move', date: '2026-10-03', movedBy: 'igeta', from: 'reservation-flow/REQ-101', to: 'reservation-flow-2/REQ-101' })}\n`,
    );
    const { report } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
  });

  it('検査不能: 承認が指す版の提出の記録が無い', () => {
    const fx = makeFixture();
    write(fx.root, `${SUBMISSION}/${LEDGER_FILENAME}`, `${JSON.stringify({ event: 'approve', targetVersion: '1.0', approvedBy: 'x', approvedAt: '2026-01-12' })}\n`);
    const { report } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
  });

  it('検査不能: --dir に存在しないディレクトリ', () => {
    const fx = approved();
    const { report } = runCheck(fx, { submissionDir: join(fx.root, 'docs/delivery/nope') });
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
  });

  it('検査不能: --dir のディレクトリに台帳が無い', () => {
    const fx = approved();
    mkdirSync(join(fx.root, 'docs/delivery/other'), { recursive: true });
    const { report } = runCheck(fx, { submissionDir: join(fx.root, 'docs/delivery/other') });
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
  });

  it('検査不能: 設定ファイルの形が不正', () => {
    const fx = approved();
    const configPath = write(fx.root, '.igeta.json', JSON.stringify({ reagreementRules: 'requirements' }));
    const { report } = runCheck(fx, { configPath });
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
  });

  it('空の台帳ファイル (0 バイト) は、承認された版が無い扱い', () => {
    const fx = makeFixture();
    write(fx.root, `${SUBMISSION}/${LEDGER_FILENAME}`, '');
    const { report, warnings } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.ok(warnings.some((w) => w.includes('承認された版がまだ無い')));
  });
});

describe('AgreementCheck: 指紋の正規化の版・載せ替えの対応表', () => {
  it('今の版 (v3) で提出した台帳の行は normalizationVersion: 3 を持つ。章・正本・提出物を動かしてリンクを書き換えても、再合意は要らない', () => {
    const root = makeLinkedRoot('igeta-agreement-v3-');
    write(root, 'docs/requirements/reservation.md', reservationDoc());
    write(root, 'docs/requirements/policy.md', POLICY_DOC);
    write(root, 'docs/glossary/terms.md', TERMS_DOC);
    const chapterPath = write(root, `${LINKED_SUBMISSION}/01-reservation.md`, chapterDoc());
    const manifestPath = write(root, `${LINKED_SUBMISSION}/deliverable.json`, MANIFEST);
    const sourceIndex = buildSourceIndex(root, join(root, 'docs'));
    for (const [anchor, source] of [
      [ANCHOR_ROW, { kind: 'from', id: ROW_FROM }],
      [ANCHOR_SECTION, { kind: 'from', id: SECTION_FROM }],
      [ANCHOR_NO_SOURCE, { kind: 'no-source', reason: 'ご挨拶' }],
    ] as const) {
      capture({ chapterAbsPath: chapterPath, targetRoot: root, anchor, source, by: 'agent:writer', sourceIndex });
    }
    accept({ targetRoot: root, chapterAbsPath: chapterPath, chapterRelPath: `${LINKED_SUBMISSION}/01-reservation.md`, target: { kind: 'all' }, by: 'reviewer@example.com', sourceIndex });
    const fx = { root, submissionDir: join(root, LINKED_SUBMISSION), manifestPath };
    assert.equal(record(fx).kind, 'ok');
    assert.equal(approveAgreement({ submissionDir: fx.submissionDir, version: '1.0', by: '発注側の責任者' }).kind, 'ok');
    const row = parseLedgerLines(readFileSync(ledgerPathFor(fx.submissionDir), 'utf8'))[0];
    assert.equal(row?.['normalizationVersion'], 3);
    assert.equal(runCheck(fx).report.exitCode, ExitCode.Ok);

    relocate({ root });
    const moved = runCheck({ ...fx, submissionDir: join(root, 'docs/client/delivery/design-document') });
    assert.equal(moved.report.exitCode, ExitCode.Ok, moved.report.format());
    assert.deepEqual(moved.warnings, []);
  });

  it('基準の行 (v2 = 版の項目なし) の指紋は v2 で計算して比べる: 版を上げただけでは再合意を出さない。本文を変えれば出す', () => {
    const repo = makeLegacyRepo();
    const fx = { root: repo.root, submissionDir: repo.submissionDir, manifestPath: '' };
    assert.equal(runCheck(fx).report.exitCode, ExitCode.Ok);
    write(repo.root, 'docs/requirements/reservation.md', reservationDoc({ row101: '| REQ-101 | 予約は 60 日前まで受け付ける | 備考 A |' }));
    const { report } = runCheck(fx);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /再合意が要る.*reservation-flow\/REQ-101/);
  });

  it('検査不能: 基準の行の正規化の版の実装が無い (この Igeta より新しい版で記録された台帳)', () => {
    const repo = makeLegacyRepo();
    const [exportLine, approveLine] = repo.ledgerLines;
    write(repo.root, `${relative(repo.root, repo.submissionDir)}/${LEDGER_FILENAME}`, `${JSON.stringify({ ...JSON.parse(exportLine ?? ''), normalizationVersion: 99 })}\n${approveLine}\n`);
    const { report } = runCheck({ root: repo.root, submissionDir: repo.submissionDir, manifestPath: '' });
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
    assert.match(report.format(), /正規化の版 99 で計算されていて、確かめられない/);
  });

  describe('fingerprint-rebase の対応表 (載せ替えた後に、リンクを書き換えた状態)', () => {
    /** 台帳を載せ替えた後、章・正本・提出物を動かす。agreement-check は対応表を通して照合する。 */
    const rebasedAndMoved = (): { root: string; submissionDir: string; ledgerPath: string; rebaseLine: string; legacy: string[] } => {
      const repo = makeLegacyRepo();
      rebaseFingerprints({ targetRoot: repo.root, docsDir: repo.docsDir, dir: repo.docsDir, now: new Date('2026-10-02T00:00:00Z') });
      const moved = relocate(repo);
      const ledgerPath = ledgerPathFor(moved.submissionDir);
      const lines = readFileSync(ledgerPath, 'utf8').replace(/\n$/, '').split('\n');
      return { root: repo.root, submissionDir: moved.submissionDir, ledgerPath, rebaseLine: lines[lines.length - 1] ?? '', legacy: lines.slice(0, -1) };
    };
    const run = (r: { root: string; submissionDir: string }): ReturnType<typeof runCheck> => runCheck({ root: r.root, submissionDir: r.submissionDir, manifestPath: '' });

    it('「保存値と一致」でなくても、直近の対応表がその保存値に対応づけた v3 の値と一致すれば一致', () => {
      const r = rebasedAndMoved();
      assert.equal(run(r).report.exitCode, ExitCode.Ok, run(r).report.format());
    });

    it('対応表が無ければ (載せ替えずに動かすと) 章の本文が変わったと数える', () => {
      const r = rebasedAndMoved();
      writeFileSync(r.ledgerPath, `${r.legacy.join('\n')}\n`);
      const { report } = run(r);
      assert.equal(report.exitCode, ExitCode.Violation, report.format());
      assert.match(report.format(), /章の本文が承認した版 1\.0 から変わった/);
    });

    it('対応表は保存値まで合わせて引く: 別の保存値への対応づけは効かない', () => {
      const r = rebasedAndMoved();
      const row = JSON.parse(r.rebaseLine) as { entries: { from: string }[] };
      for (const entry of row.entries) entry.from = 'sha256:somewhere-else';
      writeFileSync(r.ledgerPath, `${[...r.legacy, JSON.stringify(row)].join('\n')}\n`);
      assert.equal(run(r).report.exitCode, ExitCode.Violation);
    });

    it('対応づけた値 (to) が今の本文と違えば一致しない (対応表は承認の代わりにならない)', () => {
      const r = rebasedAndMoved();
      const row = JSON.parse(r.rebaseLine) as { entries: { to: string }[] };
      for (const entry of row.entries) entry.to = 'sha256:not-the-current-text';
      writeFileSync(r.ledgerPath, `${[...r.legacy, JSON.stringify(row)].join('\n')}\n`);
      assert.equal(run(r).report.exitCode, ExitCode.Violation);
    });

    it('基準より前に書かれた対応表は、基準の行の値に効かない', () => {
      const r = rebasedAndMoved();
      writeFileSync(r.ledgerPath, `${[r.rebaseLine, ...r.legacy].join('\n')}\n`);
      assert.equal(run(r).report.exitCode, ExitCode.Violation);
    });

    it('同じ保存値への対応づけが複数あれば、直近の行が勝つ (古い行は上書きされる)', () => {
      const r = rebasedAndMoved();
      const stale = JSON.parse(r.rebaseLine) as { entries: { to: string }[] };
      for (const entry of stale.entries) entry.to = 'sha256:old-mapping';
      writeFileSync(r.ledgerPath, `${[...r.legacy, JSON.stringify(stale), r.rebaseLine].join('\n')}\n`);
      assert.equal(run(r).report.exitCode, ExitCode.Ok, run(r).report.format());
      writeFileSync(r.ledgerPath, `${[...r.legacy, r.rebaseLine, JSON.stringify(stale)].join('\n')}\n`);
      assert.equal(run(r).report.exitCode, ExitCode.Violation, '直近が古い対応づけなら、一致しない');
    });

    it('検査不能: 対応表の版の実装が無い (この Igeta より新しい版で記録された台帳)', () => {
      const r = rebasedAndMoved();
      const row = JSON.parse(r.rebaseLine) as Record<string, unknown>;
      writeFileSync(r.ledgerPath, `${[...r.legacy, JSON.stringify({ ...row, toVersion: 99 })].join('\n')}\n`);
      const { report } = run(r);
      assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
      assert.match(report.format(), /対応表の正規化の版が確かめられない/);
    });
  });
});
