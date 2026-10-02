// node --test dist/generators/SourceMoveModule.test.js
// 行 (節) の移動: 移した行の文字が元と同じことを指紋で確かめ、由来の from を付け替え、台帳に source-move を追記する。
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgreementCheck } from '../checks/AgreementCheck.js';
import { ProvenanceCheck } from '../checks/ProvenanceCheck.js';
import { ledgerPathFor } from '../core/AgreementLedger.js';
import { Report } from '../core/Report.js';
import { sidecarPathFor } from '../core/ProvenanceSidecar.js';
import { rebaseFingerprints } from './FingerprintRebaseModule.js';
import { moveSourceRows } from './SourceMoveModule.js';
import type { SourceMove } from './SourceMoveModule.js';
import {
  ANCHOR_ROW, ANCHOR_SECTION, ROW_101, ROW_102, ROW_FROM, SECTION_FROM, SUBMISSION,
  cleanupWorkspaces, makeLegacyRepo, parseLedgerLines, readEntries, readLedgerBytes, relocate, reservationDoc, write,
} from './rebaseFixture.test-support.js';
import type { LegacyRepo } from './rebaseFixture.test-support.js';
import { lineDiff } from '../core/lineDiff.test-support.js';

after(cleanupWorkspaces);

const NOW = new Date('2026-10-03T09:00:00Z');
const NEW_ROW_FROM = 'reservation-flow-2/REQ-101';
const NEW_SECTION_FROM = 'reservation-flow-2#2. 補足';
const SUPPLEMENT = '詳しくは [規約](./policy.md#キャンセル) と [外部](https://example.com/x) を参照。';

function move(repo: LegacyRepo, moves: readonly SourceMove[]): ReturnType<typeof moveSourceRows> {
  return moveSourceRows({ targetRoot: repo.root, docsDir: repo.docsDir, dir: repo.docsDir, moves, now: NOW });
}

function runProvenance(root: string): { report: Report; warnings: readonly string[] } {
  const check = new ProvenanceCheck({ targetRoot: root });
  const report = new Report();
  report.addAll(check.analyze().violations);
  return { report, warnings: check.warnings };
}

function runAgreement(root: string): { report: Report; warnings: readonly string[] } {
  const check = new AgreementCheck();
  const report = new Report();
  report.addAll(check.run({ targetRoot: root, igetaRoot: root }));
  return { report, warnings: check.warnings };
}

/** 分割した後の文書 (id reservation-flow-2)。 */
function splitDoc(options: { row?: string; section?: string } = {}): string {
  const row = options.row ?? ROW_101;
  return [
    '---', 'id: reservation-flow-2', 'kind: requirements', 'status: fixed', 'depends_on: []', '---', '',
    '# 要件 (分割)', '',
    '## 1. 機能要件 (続き)', '',
    '| ID | 要件 | 備考 |', '|---|---|---|',
    row,
    '',
    ...(options.section === undefined ? [] : ['## 2. 補足', '', options.section, '']),
  ].join('\n');
}

/** REQ-101 の行を別の文書 reservation-flow-2 へ移した repo (元の文書からは行を除く)。 */
function moveRowOut(repo: LegacyRepo, options: { row?: string; path?: string } = {}): void {
  write(repo.root, 'docs/requirements/reservation.md', reservationDoc().replace(`${ROW_101}\n`, ''));
  write(repo.root, options.path ?? 'docs/requirements/reservation-flow-2.md', splitDoc({ row: options.row }));
}

/** 節 `2. 補足` を別の文書 reservation-flow-2 へ移した repo。 */
function moveSectionOut(repo: LegacyRepo, options: { section?: string } = {}): void {
  write(repo.root, 'docs/requirements/reservation.md', reservationDoc().replace(`## 2. 補足\n\n${SUPPLEMENT}\n`, ''));
  write(repo.root, 'docs/requirements/reservation-flow-2.md', splitDoc({ row: '| REQ-201 | 別の行 | - |', section: options.section ?? SUPPLEMENT }));
}

describe('行の移動 (ADR-0006 決定 7)', () => {
  it('(h) 移した行の文字が元と同じなら、由来の from が新しい文書の id へ付け替わり、台帳に source-move が追記される', () => {
    const repo = makeLegacyRepo();
    const before = readEntries(repo.chapterPath);
    const sidecarBefore = readFileSync(sidecarPathFor(repo.chapterPath), 'utf8');
    const ledgerBefore = readLedgerBytes(repo);
    moveRowOut(repo);
    const result = move(repo, [{ from: ROW_FROM, to: NEW_ROW_FROM }]);
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.kept, []);

    const after = readEntries(repo.chapterPath);
    const entry = after[0];
    const entryBefore = before[0];
    assert.ok(entry !== undefined && entry.from !== null && entryBefore !== undefined && entryBefore.from !== null);
    assert.equal(entry.from, NEW_ROW_FROM);
    // 向き先以外は 1 項目も変わらない (指紋・版・承認)
    assert.deepEqual({ ...entry, from: ROW_FROM }, entryBefore);
    assert.deepEqual(after.slice(1), before.slice(1), '他のエントリは触らない');

    // sidecar の差分には from の 1 行だけが出る (指紋・版・承認の行は動かない)
    const diff = lineDiff(sidecarBefore, readFileSync(sidecarPathFor(repo.chapterPath), 'utf8'));
    assert.deepEqual(diff.removed.map((l) => l.trim()), [`"from": "${ROW_FROM}",`]);
    assert.deepEqual(diff.added.map((l) => l.trim()), [`"from": "${NEW_ROW_FROM}",`]);

    // 台帳: 過去の行は 1 バイトも変わらず、source-move が 1 行だけ追記される
    const ledgerAfter = readLedgerBytes(repo);
    assert.ok(ledgerAfter.startsWith(ledgerBefore));
    const appended = parseLedgerLines(ledgerAfter.slice(ledgerBefore.length));
    assert.deepEqual(appended, [{ event: 'source-move', date: '2026-10-03', movedBy: 'igeta', from: ROW_FROM, to: NEW_ROW_FROM }]);
    assert.equal(result.moved.length, 2);
  });

  it('(h) 付け替えた後は、provenance-check も agreement-check も ok (agreement-check は source-move の対応を通して照合する)', () => {
    const repo = makeLegacyRepo();
    moveRowOut(repo);
    move(repo, [{ from: ROW_FROM, to: NEW_ROW_FROM }]);
    const provenance = runProvenance(repo.root);
    assert.equal(provenance.report.exitCode, 0, provenance.report.format());
    const agreement = runAgreement(repo.root);
    assert.equal(agreement.report.exitCode, 0, agreement.report.format());
    assert.deepEqual(agreement.warnings, []);
  });

  it('対照: 付け替えなければ、由来は source-missing、台帳は「正本が無くなった」で再合意が要る', () => {
    const repo = makeLegacyRepo();
    moveRowOut(repo);
    assert.match(runProvenance(repo.root).report.format(), /source-missing/);
    assert.match(runAgreement(repo.root).report.format(), /再合意が要る.*正本が無くなった.*reservation-flow\/REQ-101/);
  });

  it('(h) 移すときに文字を変えていれば付け替えない。由来も台帳も 1 バイトも変わらない', () => {
    const repo = makeLegacyRepo();
    moveRowOut(repo, { row: ROW_101.replace('30 日前', '45 日前') });
    const sidecarBytes = readFileSync(sidecarPathFor(repo.chapterPath), 'utf8');
    const ledgerBytes = readLedgerBytes(repo);
    const result = move(repo, [{ from: ROW_FROM, to: NEW_ROW_FROM }]);
    assert.deepEqual(result.moved, []);
    assert.equal(readFileSync(sidecarPathFor(repo.chapterPath), 'utf8'), sidecarBytes);
    assert.equal(readLedgerBytes(repo), ledgerBytes);
    assert.ok(result.kept.length >= 1);
    assert.match(result.kept.map((i) => i.detail).join('\n'), /文字が変わっている|確かめられない/);
    assert.match(runProvenance(repo.root).report.format(), /source-missing/);
  });

  it('(h) 文字を変えて移した行は、台帳の対応づけにも載らない: 再合意が要るかは人が決める (ADR-0006 決定 6)', () => {
    const repo = makeLegacyRepo();
    moveRowOut(repo, { row: ROW_101.replace('30 日前', '45 日前') });
    move(repo, [{ from: ROW_FROM, to: NEW_ROW_FROM }]);
    const agreement = runAgreement(repo.root);
    assert.equal(agreement.report.exitCode, 1, agreement.report.format());
  });

  it('節の移動: 節ごと別の文書へ移し、文字が同じなら付け替わる (節と行の両方、章と正本の両方で確かめる)', () => {
    const repo = makeLegacyRepo();
    moveSectionOut(repo);
    const result = move(repo, [{ from: SECTION_FROM, to: NEW_SECTION_FROM }]);
    assert.deepEqual(result.violations, []);
    const entry = readEntries(repo.chapterPath).find((e) => e.anchor === ANCHOR_SECTION);
    assert.equal(entry?.from, NEW_SECTION_FROM);
    assert.equal(runProvenance(repo.root).report.exitCode, 0);
    assert.equal(runAgreement(repo.root).report.exitCode, 0, runAgreement(repo.root).report.format());
  });

  it('節の移動: 節の文字を変えていれば付け替えない', () => {
    const repo = makeLegacyRepo();
    moveSectionOut(repo, { section: `${SUPPLEMENT}(改訂)` });
    const ledgerBytes = readLedgerBytes(repo);
    const result = move(repo, [{ from: SECTION_FROM, to: NEW_SECTION_FROM }]);
    assert.deepEqual(result.moved, []);
    assert.equal(readLedgerBytes(repo), ledgerBytes);
    assert.equal(readEntries(repo.chapterPath).find((e) => e.anchor === ANCHOR_SECTION)?.from, SECTION_FROM);
  });

  it('1 回の呼び出しで複数の移動を扱える (行と節)。確かめられなかったものだけ付け替えない', () => {
    const repo = makeLegacyRepo();
    write(repo.root, 'docs/requirements/reservation.md', reservationDoc().replace(`${ROW_101}\n`, '').replace(`## 2. 補足\n\n${SUPPLEMENT}\n`, ''));
    write(repo.root, 'docs/requirements/reservation-flow-2.md', splitDoc({ row: ROW_101.replace('30 日前', '45 日前'), section: SUPPLEMENT }));
    const result = move(repo, [{ from: ROW_FROM, to: NEW_ROW_FROM }, { from: SECTION_FROM, to: NEW_SECTION_FROM }]);
    const entries = readEntries(repo.chapterPath);
    assert.equal(entries.find((e) => e.anchor === ANCHOR_ROW)?.from, ROW_FROM, '文字を変えた行は付け替わらない');
    assert.equal(entries.find((e) => e.anchor === ANCHOR_SECTION)?.from, NEW_SECTION_FROM, '同じ節は付け替わる');
    const events = parseLedgerLines(readLedgerBytes(repo)).filter((r) => r['event'] === 'source-move');
    assert.deepEqual(events.map((e) => e['to']), [NEW_SECTION_FROM]);
    assert.equal(result.kept.length >= 1, true);
  });

  it('2 回動かした行 (A → B → C) は、台帳の対応が連鎖して今の居場所まで届く', () => {
    const repo = makeLegacyRepo();
    moveRowOut(repo);
    move(repo, [{ from: ROW_FROM, to: NEW_ROW_FROM }]);
    // さらに別の文書 reservation-flow-3 へ移す
    write(repo.root, 'docs/requirements/reservation-flow-2.md', splitDoc({ row: '| REQ-201 | 別の行 | - |' }));
    write(repo.root, 'docs/requirements/reservation-flow-3.md', splitDoc({ row: ROW_101 }).replace('id: reservation-flow-2', 'id: reservation-flow-3'));
    const second = move(repo, [{ from: NEW_ROW_FROM, to: 'reservation-flow-3/REQ-101' }]);
    assert.deepEqual(second.violations, []);
    assert.equal(readEntries(repo.chapterPath)[0]?.from, 'reservation-flow-3/REQ-101');
    const agreement = runAgreement(repo.root);
    assert.equal(agreement.report.exitCode, 0, agreement.report.format());
    assert.equal(parseLedgerLines(readLedgerBytes(repo)).filter((r) => r['event'] === 'source-move').length, 2);
  });

  it('同じ移動をもう一度渡しても何も変わらない (冪等)', () => {
    const repo = makeLegacyRepo();
    moveRowOut(repo);
    move(repo, [{ from: ROW_FROM, to: NEW_ROW_FROM }]);
    const sidecarBytes = readFileSync(sidecarPathFor(repo.chapterPath), 'utf8');
    const ledgerBytes = readLedgerBytes(repo);
    const again = move(repo, [{ from: ROW_FROM, to: NEW_ROW_FROM }]);
    assert.deepEqual(again.moved, []);
    assert.match(again.kept[0]?.detail ?? '', /指す由来も台帳も無い/);
    assert.equal(readFileSync(sidecarPathFor(repo.chapterPath), 'utf8'), sidecarBytes);
    assert.equal(readLedgerBytes(repo), ledgerBytes);
  });

  it('新しい from が解決できなければ付け替えない', () => {
    const repo = makeLegacyRepo();
    moveRowOut(repo);
    const ledgerBytes = readLedgerBytes(repo);
    const result = move(repo, [{ from: ROW_FROM, to: 'no-such-doc/REQ-101' }]);
    assert.deepEqual(result.moved, []);
    assert.match(result.kept[0]?.detail ?? '', /新しい from が解決できない/);
    assert.equal(readEntries(repo.chapterPath)[0]?.from, ROW_FROM);
    assert.equal(readLedgerBytes(repo), ledgerBytes);
  });

  it('台帳が無い章は、由来だけを付け替える (台帳を作らない)', () => {
    const repo = makeLegacyRepo();
    rmSync(ledgerPathFor(repo.submissionDir));
    moveRowOut(repo);
    const result = move(repo, [{ from: ROW_FROM, to: NEW_ROW_FROM }]);
    assert.equal(readEntries(repo.chapterPath)[0]?.from, NEW_ROW_FROM);
    assert.equal(existsSync(ledgerPathFor(repo.submissionDir)), false);
    assert.equal(result.moved.length, 1);
  });

  it('由来が無い (台帳だけが指す) 行の移動も、文字が台帳の保存値と同じなら、台帳に source-move を追記する', () => {
    const repo = makeLegacyRepo();
    rmSync(sidecarPathFor(repo.chapterPath));
    moveRowOut(repo);
    const result = move(repo, [{ from: ROW_FROM, to: NEW_ROW_FROM }]);
    assert.deepEqual(result.violations, []);
    assert.equal(parseLedgerLines(readLedgerBytes(repo)).filter((r) => r['event'] === 'source-move').length, 1);
    assert.equal(runAgreement(repo.root).report.exitCode, 0);
  });

  it('由来のエントリだけが古く (既に stale)、台帳の保存値と移した行は同じとき: 台帳には書き、古い由来は付け替えない', () => {
    const repo = makeLegacyRepo();
    // 由来の保存値を、別の本文のものに書き換える (台帳の保存値は今の行と同じまま)
    const path = sidecarPathFor(repo.chapterPath);
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { entries: { anchor: string; fingerprint?: string }[] };
    const first = raw.entries[0];
    assert.ok(first !== undefined);
    first.fingerprint = 'sha256:stale';
    writeFileSync(path, JSON.stringify(raw, null, 2));
    moveRowOut(repo);
    const result = move(repo, [{ from: ROW_FROM, to: NEW_ROW_FROM }]);
    assert.equal(readEntries(repo.chapterPath)[0]?.from, ROW_FROM, '古い由来は付け替えない');
    assert.equal(parseLedgerLines(readLedgerBytes(repo)).filter((r) => r['event'] === 'source-move').length, 1);
    assert.ok(result.kept.some((i) => i.target === ANCHOR_ROW));
  });

  it('壊れた台帳は検査不能として返し、その台帳には書かない (由来は付け替わる)', () => {
    const repo = makeLegacyRepo();
    moveRowOut(repo);
    write(repo.root, `${SUBMISSION}/agreements.ledger.jsonl`, '{ not json\n');
    const result = move(repo, [{ from: ROW_FROM, to: NEW_ROW_FROM }]);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]?.severity, 'cannot-check');
    assert.equal(readEntries(repo.chapterPath)[0]?.from, NEW_ROW_FROM, '由来は付け替わる');
    assert.equal(readFileSync(join(repo.root, SUBMISSION, 'agreements.ledger.jsonl'), 'utf8'), '{ not json\n', '壊れた台帳は触らない');
  });
});

describe('行の移動と、指紋の載せ替えの順序', () => {
  it('v2 のまま、リンクのパスが変わる場所へ移した行は付け替えない (v2 はパスの違いを別の文字と数える。先に載せ替える)', () => {
    const repo = makeLegacyRepo();
    // 1 段深い docs/requirements/sub/ へ移すと、行の中のリンクの相対パスが変わる
    moveRowOut(repo, { path: 'docs/requirements/sub/reservation-flow-2.md', row: ROW_101.replace('../glossary/terms.md', '../../glossary/terms.md') });
    const result = move(repo, [{ from: ROW_FROM, to: NEW_ROW_FROM }]);
    assert.deepEqual(result.moved, []);
    assert.equal(readEntries(repo.chapterPath)[0]?.from, ROW_FROM);
  });

  it('先に載せ替えてあれば (v3)、リンクのパスが変わる場所へ移した行も、同じ文書を指すなら付け替わる', () => {
    const repo = makeLegacyRepo();
    rebaseFingerprints({ targetRoot: repo.root, docsDir: repo.docsDir, dir: repo.docsDir, now: NOW });
    moveRowOut(repo, { path: 'docs/requirements/sub/reservation-flow-2.md', row: ROW_101.replace('../glossary/terms.md', '../../glossary/terms.md') });
    const result = move(repo, [{ from: ROW_FROM, to: NEW_ROW_FROM }]);
    assert.deepEqual(result.violations, []);
    assert.equal(readEntries(repo.chapterPath)[0]?.from, NEW_ROW_FROM);
    assert.equal(runProvenance(repo.root).report.exitCode, 0, runProvenance(repo.root).report.format());
    assert.equal(runAgreement(repo.root).report.exitCode, 0, runAgreement(repo.root).report.format());
  });

  it('付け替えた後に載せ替えても、台帳の対応表は元の from (付け替え前) で引かれ、動かした後も ok', () => {
    const repo = makeLegacyRepo();
    moveRowOut(repo);
    move(repo, [{ from: ROW_FROM, to: NEW_ROW_FROM }]);
    const rebased = rebaseFingerprints({ targetRoot: repo.root, docsDir: repo.docsDir, dir: repo.docsDir, now: NOW });
    assert.deepEqual(rebased.violations, []);
    const rebaseRow = parseLedgerLines(readLedgerBytes(repo)).find((r) => r['event'] === 'fingerprint-rebase');
    assert.ok((rebaseRow?.['entries'] as { target: string }[]).some((e) => e.target === ROW_FROM), '台帳の保存値の from (付け替え前) をキーにする');
    relocate(repo);
    const agreement = runAgreement(repo.root);
    assert.equal(agreement.report.exitCode, 0, agreement.report.format());
    assert.equal(runProvenance(repo.root).report.exitCode, 0, runProvenance(repo.root).report.format());
  });
});

// REQ-102 は fixture の別の行 (由来が指さない)。移しても由来・台帳には効かない
describe('指されていない行の移動', () => {
  it('由来も台帳も指さない行を移しても、何も書かない', () => {
    const repo = makeLegacyRepo();
    write(repo.root, 'docs/requirements/reservation.md', reservationDoc().replace(`${ROW_102}\n`, ''));
    write(repo.root, 'docs/requirements/reservation-flow-2.md', splitDoc({ row: ROW_102 }));
    const sidecarBytes = readFileSync(sidecarPathFor(repo.chapterPath), 'utf8');
    const ledgerBytes = readLedgerBytes(repo);
    const result = move(repo, [{ from: 'reservation-flow/REQ-102', to: 'reservation-flow-2/REQ-102' }]);
    assert.deepEqual(result.moved, []);
    assert.match(result.kept[0]?.detail ?? '', /指す由来も台帳も無い/);
    assert.equal(readFileSync(sidecarPathFor(repo.chapterPath), 'utf8'), sidecarBytes);
    assert.equal(readLedgerBytes(repo), ledgerBytes);
  });
});
