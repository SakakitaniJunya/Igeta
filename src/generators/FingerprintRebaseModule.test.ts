// node --test dist/generators/FingerprintRebaseModule.test.js
// fingerprint-rebase: v2 の時代に書かれた由来 sidecar と合意台帳 (rebaseFixture) を、v3 へ載せ替える。
// 節と行の両方・章と正本の両方がリンクを含む fixture で、載せ替えの条件と、載せ替えた後の検査の結果を確かめる。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgreementCheck } from '../checks/AgreementCheck.js';
import { ProvenanceCheck } from '../checks/ProvenanceCheck.js';
import { appendLedgerEvent, ledgerPathFor } from '../core/AgreementLedger.js';
import type { AgreementEvent, AgreementExportEvent } from '../core/AgreementLedger.js';
import { extractDeliveryBlocks } from '../core/DeliveryBlocks.js';
import { computeFingerprint } from '../core/Fingerprint.js';
import { buildLinkTable } from '../core/LinkTable.js';
import { sidecarPathFor } from '../core/ProvenanceSidecar.js';
import { Report } from '../core/Report.js';
import { buildSourceIndex, resolveSource } from '../core/SourceResolver.js';
import { chapterBody } from './AgreementRecordModule.js';
import { rebaseFingerprints } from './FingerprintRebaseModule.js';
import type { StateColumnRow } from './FingerprintRebaseModule.js';
import {
  ANCHOR_NO_SOURCE, ANCHOR_ROW, ANCHOR_SECTION, CHAPTER, ROW_101, ROW_102, ROW_FROM, SECTION_FROM, SUBMISSION,
  chapterDoc, cleanupWorkspaces, makeLegacyRepo, parseLedgerLines, readEntries, readLedgerBytes, relocate, reservationDoc, write,
} from './rebaseFixture.test-support.js';
import type { LegacyRepo } from './rebaseFixture.test-support.js';
import { lineDiff } from '../core/lineDiff.test-support.js';

after(cleanupWorkspaces);

const NOW = new Date('2026-10-02T09:00:00Z');

function rebase(repo: LegacyRepo, overrides: { stateColumnRows?: ReadonlyMap<string, StateColumnRow>; dir?: string } = {}): ReturnType<typeof rebaseFingerprints> {
  return rebaseFingerprints({ targetRoot: repo.root, docsDir: repo.docsDir, dir: overrides.dir ?? repo.docsDir, now: NOW, stateColumnRows: overrides.stateColumnRows });
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

/** 載せ替え後の値を、repo の状態から独立に計算する (LinkTable を直接使う)。 */
function v3Of(root: string, docRelPath: string, text: string): string {
  return computeFingerprint(text, 3, buildLinkTable(root, buildSourceIndex(root, join(root, 'docs'))).rewriterFor(docRelPath));
}

function sourceText(root: string, from: string): string {
  const index = buildSourceIndex(root, join(root, 'docs'));
  const resolution = index === null ? { kind: 'missing' as const } : resolveSource(index, from);
  if (resolution.kind === 'missing') throw new Error(`解決できない: ${from}`);
  return resolution.text;
}

function blockText(chapterPath: string, relPath: string, anchor: string): string {
  const extracted = extractDeliveryBlocks(readFileSync(chapterPath, 'utf8'), relPath);
  if (extracted.kind !== 'ok') throw new Error('章の塊が取れない');
  const block = extracted.blocks.find((b) => b.anchor === anchor);
  if (block === undefined) throw new Error(`塊が無い: ${anchor}`);
  return block.text;
}

const appendRows = (repo: LegacyRepo, rows: readonly AgreementEvent[]): void => {
  for (const row of rows) assert.equal(appendLedgerEvent(repo.submissionDir, row), null);
};

describe('載せ替える前の状態 (v2 の時代の repo、版を上げた直後)', () => {
  it('provenance-check: 保存した版 (v2) で計算すると一致するので stale にならず、needs-recompute の警告だけが出る', () => {
    const repo = makeLegacyRepo();
    const { report, warnings } = runProvenance(repo.root);
    assert.equal(report.exitCode, 0, report.format());
    assert.equal(warnings.filter((w) => w.includes('needs-recompute')).length, 3, warnings.join('\n'));
    assert.match(warnings.join('\n'), /fingerprint-rebase/);
  });

  it('provenance-check: 保存した版で計算して違うエントリは、版が古くても stale (needs-recompute に隠れない)', () => {
    const repo = makeLegacyRepo();
    write(repo.root, 'docs/requirements/reservation.md', reservationDoc({ row101: ROW_101.replace('30 日前', '60 日前') }));
    const { report } = runProvenance(repo.root);
    assert.equal(report.exitCode, 1, report.format());
    assert.match(report.format(), new RegExp(`${ANCHOR_ROW}: stale`));
  });

  it('agreement-check: 版が違うだけでは再合意を出さない (台帳の行は版を持たない = v2 として、v2 で計算して比べる)', () => {
    const repo = makeLegacyRepo();
    const { report, warnings } = runAgreement(repo.root);
    assert.equal(report.exitCode, 0, report.format());
    assert.deepEqual(warnings, []);
  });
});

describe('fingerprint-rebase: 由来 sidecar', () => {
  it('(c) v2 で一致するエントリだけが載せ替わり、承認 (acceptedBy / acceptedAt) と capturedBy / capturedAt が保たれる', () => {
    const repo = makeLegacyRepo();
    const before = readEntries(repo.chapterPath);
    const result = rebase(repo);
    assert.deepEqual(result.violations, []);

    const after = readEntries(repo.chapterPath);
    const [row, section, noSource] = after;
    const [rowBefore, sectionBefore, noSourceBefore] = before;
    assert.ok(row !== undefined && section !== undefined && noSource !== undefined);
    assert.ok(rowBefore !== undefined && sectionBefore !== undefined && noSourceBefore !== undefined);
    assert.ok(row.from !== null && section.from !== null && noSource.from === null);
    assert.ok(rowBefore.from !== null && sectionBefore.from !== null && noSourceBefore.from === null);

    // 行 (REQ-101): 同じ本文から v3 を計算した値に付け替わる
    assert.equal(row.fingerprint, v3Of(repo.root, 'docs/requirements/reservation.md', ROW_101));
    assert.notEqual(row.fingerprint, rowBefore.fingerprint, 'リンクを含む行なので v2 と v3 は違う値');
    assert.equal(row.normalizationVersion, 3);
    assert.equal(row.rebasedFrom, rowBefore.fingerprint);
    assert.equal(row.rebasedAt, '2026-10-02');
    assert.equal(row.rebasedBy, 'igeta');
    // 節 (2. 補足)
    assert.equal(section.fingerprint, v3Of(repo.root, 'docs/requirements/reservation.md', sourceText(repo.root, SECTION_FROM)));
    assert.equal(section.rebasedFrom, sectionBefore.fingerprint);
    // 由来なし (章の塊。章の文書を起点にリンクを解決する)
    assert.equal(noSource.blockFingerprint, v3Of(repo.root, CHAPTER, blockText(repo.chapterPath, CHAPTER, ANCHOR_NO_SOURCE)));
    assert.equal(noSource.rebasedFrom, noSourceBefore.blockFingerprint);
    assert.equal(noSource.normalizationVersion, 3);

    // 承認と記録者は 1 つも変わらない
    for (const [next, prev] of [[row, rowBefore], [section, sectionBefore], [noSource, noSourceBefore]] as const) {
      assert.equal(next.acceptedBy, 'reviewer@example.com');
      assert.equal(next.acceptedAt, '2026-09-29');
      assert.equal(next.acceptedBy, prev.acceptedBy);
      assert.equal(next.acceptedAt, prev.acceptedAt);
      assert.equal(next.capturedBy, prev.capturedBy);
      assert.equal(next.capturedAt, prev.capturedAt);
      assert.equal(next.anchor, prev.anchor);
    }
    assert.equal(result.rebased.filter((i) => i.file === CHAPTER).length, 3);
  });

  it('sidecar の差分には、変えた項目 (指紋・版・載せ替えの記録) だけが出る。承認・記録者・anchor・from の行は動かない', () => {
    const repo = makeLegacyRepo();
    const path = sidecarPathFor(repo.chapterPath);
    const before = readFileSync(path, 'utf8');
    rebase(repo);
    const { removed, added } = lineDiff(before, readFileSync(path, 'utf8'));
    const touched = (lines: readonly string[]): string[] => lines.map((l) => l.trim().replace(/^"([^"]+)".*$/, '$1'));
    assert.deepEqual([...new Set(touched(removed))].sort(), ['blockFingerprint', 'fingerprint', 'normalizationVersion']);
    assert.deepEqual([...new Set(touched(added))].sort(), ['blockFingerprint', 'fingerprint', 'normalizationVersion', 'rebasedAt', 'rebasedBy', 'rebasedFrom']);
    // 3 エントリ分: 指紋 1 行 + 版 1 行が消え、指紋・版・載せ替えの記録 3 行が増える
    assert.equal(removed.length, 6);
    assert.equal(added.length, 15);
  });

  it('載せ替えた後の provenance-check: 3 件とも ok で、警告も出ない', () => {
    const repo = makeLegacyRepo();
    rebase(repo);
    const { report, warnings } = runProvenance(repo.root);
    assert.equal(report.exitCode, 0, report.format());
    assert.deepEqual(warnings, []);
  });

  it('(d) v2 で一致しないエントリは触られない。stale のまま人の確認に回る', () => {
    const repo = makeLegacyRepo();
    // 節 2. 補足 の正本を書き換える (保存した版 v2 で計算すると、保存値と違う)
    write(repo.root, 'docs/requirements/reservation.md', reservationDoc({ supplement: '詳しくは [規約](./policy.md#キャンセル) を参照。(改訂)' }));
    const before = readEntries(repo.chapterPath);
    const sidecarBefore = readFileSync(sidecarPathFor(repo.chapterPath), 'utf8');
    const result = rebase(repo);
    const after = readEntries(repo.chapterPath);
    const sidecarAfter = readFileSync(sidecarPathFor(repo.chapterPath), 'utf8');

    assert.deepEqual(after[1], before[1], '一致しなかったエントリは 1 項目も変わらない');
    const rawEntries = (text: string): unknown[] => (JSON.parse(text) as { entries: unknown[] }).entries;
    assert.equal(JSON.stringify(rawEntries(sidecarAfter)[1]), JSON.stringify(rawEntries(sidecarBefore)[1]), '項目の並びまで同じ (差分に出ない)');
    assert.equal(after[1]?.normalizationVersion, 2);
    assert.equal(after[1] !== undefined && 'rebasedFrom' in after[1], false);
    assert.equal(after[0]?.normalizationVersion, 3, '一致した他のエントリは載せ替わる');
    assert.equal(after[2]?.normalizationVersion, 3);

    const kept = result.kept.find((i) => i.file === CHAPTER && i.target === ANCHOR_SECTION);
    assert.ok(kept !== undefined, JSON.stringify(result.kept));
    assert.match(kept.detail, /版 2 で計算した今の本文が保存値と違う/);

    const { report } = runProvenance(repo.root);
    assert.equal(report.exitCode, 1, report.format());
    assert.match(report.format(), new RegExp(`${ANCHOR_SECTION}: stale`));
    assert.doesNotMatch(report.format(), new RegExp(`${ANCHOR_ROW}:`), '載せ替えたものは ok');
  });

  it('何も載せ替えなければ sidecar のファイルは書き換えない', () => {
    const repo = makeLegacyRepo();
    write(repo.root, 'docs/requirements/reservation.md', reservationDoc({ row101: ROW_101.replace('30 日前', '60 日前'), supplement: '別の本文。' }));
    write(repo.root, CHAPTER, chapterDoc().replace('ご挨拶です。', 'ご挨拶です (改訂)。'));
    const bytes = readFileSync(sidecarPathFor(repo.chapterPath), 'utf8');
    const result = rebase(repo);
    assert.equal(result.rebased.filter((i) => i.file === CHAPTER).length, 0);
    assert.equal(readFileSync(sidecarPathFor(repo.chapterPath), 'utf8'), bytes);
  });

  it('保存した版の実装が無いエントリ (v1) は「確かめられない」として載せ替えない (版番号が古いだけでは一致とみなさない)', () => {
    const repo = makeLegacyRepo();
    const path = sidecarPathFor(repo.chapterPath);
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { entries: { normalizationVersion: number }[] };
    for (const entry of raw.entries) entry.normalizationVersion = 1;
    writeFileSync(path, JSON.stringify(raw, null, 2));
    const before = readEntries(repo.chapterPath);
    const result = rebase(repo);
    assert.deepEqual(readEntries(repo.chapterPath), before);
    assert.equal(result.kept.filter((i) => i.file === CHAPTER).length, 3);
    assert.match(result.kept.find((i) => i.file === CHAPTER)?.detail ?? '', /版 1 の実装が無く確かめられない/);
  });

  it('既に今の版のエントリは対象外。もう一度実行しても何も変わらない (冪等)', () => {
    const repo = makeLegacyRepo();
    rebase(repo);
    const sidecarBytes = readFileSync(sidecarPathFor(repo.chapterPath), 'utf8');
    const ledgerBytes = readLedgerBytes(repo);
    const second = rebase(repo);
    assert.deepEqual(second.rebased, []);
    assert.deepEqual(second.kept, []);
    assert.equal(readFileSync(sidecarPathFor(repo.chapterPath), 'utf8'), sidecarBytes);
    assert.equal(readLedgerBytes(repo), ledgerBytes);
  });

  it('解決できない由来 (source-missing) と、章に無い塊 (orphan) は触らず、理由を返す', () => {
    const repo = makeLegacyRepo();
    write(repo.root, 'docs/requirements/reservation.md', reservationDoc().replace(/\| REQ-101 \|.*\n/, ''));
    write(repo.root, CHAPTER, chapterDoc().replace('## 3. ご挨拶', '## 3. ご挨拶 (改題)'));
    const before = readEntries(repo.chapterPath);
    const result = rebase(repo);
    const after = readEntries(repo.chapterPath);
    assert.deepEqual(after[0], before[0]);
    assert.deepEqual(after[2], before[2]);
    assert.equal(after[1]?.normalizationVersion, 3, '節の由来は解決できるので載せ替わる');
    const details = result.kept.filter((i) => i.file === CHAPTER).map((i) => `${i.target}: ${i.detail}`).join('\n');
    assert.match(details, /1\. 予約の受付: from が解決できない \(source-missing\)/);
    assert.match(details, /3\. ご挨拶: anchor が章に無い \(orphan\)/);
  });

  it('壊れた sidecar は検査不能として返し、他の章は載せ替える', () => {
    const repo = makeLegacyRepo();
    writeFileSync(sidecarPathFor(repo.chapterPath), '{ not json');
    write(repo.root, 'docs/delivery/other/02-other.md', ['---', 'id: chapter-other', 'kind: delivery-chapter', 'depends_on: []', '---', '', '# 他', ''].join('\n'));
    const result = rebase(repo);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]?.severity, 'cannot-check');
    assert.match(result.violations[0]?.message ?? '', /JSON が壊れている/);
  });
});

describe('fingerprint-rebase: 合意台帳', () => {
  it('(e) 過去の行は 1 バイトも変わらず、fingerprint-rebase の行が 1 行だけ追記される', () => {
    const repo = makeLegacyRepo();
    const before = readLedgerBytes(repo);
    assert.equal(before, `${repo.ledgerLines.join('\n')}\n`);
    rebase(repo);
    const after = readLedgerBytes(repo);
    assert.ok(after.startsWith(before), '既存の行は書き換わらない');
    const appended = after.slice(before.length);
    assert.equal(appended.split('\n').length, 2, '追記は 1 行 (末尾の改行を除く)');
    assert.ok(appended.endsWith('\n'));
    const rows = parseLedgerLines(after);
    assert.equal(rows.length, repo.ledgerLines.length + 1);
    assert.equal(rows.at(-1)?.['event'], 'fingerprint-rebase');
  });

  it('対応表は指紋 1 つごと (章 1 つにつき sources の数 + 1 本)。キーは章ファイル + 対象、from が保存値、to が同じ本文から計算した v3', () => {
    const repo = makeLegacyRepo();
    rebase(repo);
    const row = parseLedgerLines(readLedgerBytes(repo)).at(-1);
    assert.ok(row !== undefined);
    assert.equal(row['rebasedBy'], 'igeta');
    assert.equal(row['date'], '2026-10-02');
    assert.equal(row['fromVersion'], 2);
    assert.equal(row['toVersion'], 3);
    const exportRow = JSON.parse(repo.ledgerLines[0] ?? '') as { chapters: { chapterFingerprint: string; sources: { from: string; fingerprint: string }[] }[] };
    const chapter = exportRow.chapters[0];
    assert.ok(chapter !== undefined);
    const content = readFileSync(repo.chapterPath, 'utf8');
    assert.deepEqual(row['entries'], [
      { file: '01-reservation.md', target: 'chapterFingerprint', from: chapter.chapterFingerprint, to: computeFingerprint(chapterBody(content, CHAPTER, ['関連']), 3, buildLinkTable(repo.root, buildSourceIndex(repo.root, repo.docsDir)).rewriterFor(CHAPTER)) },
      { file: '01-reservation.md', target: ROW_FROM, from: chapter.sources[0]?.fingerprint, to: v3Of(repo.root, 'docs/requirements/reservation.md', ROW_101) },
      { file: '01-reservation.md', target: SECTION_FROM, from: chapter.sources[1]?.fingerprint, to: v3Of(repo.root, 'docs/requirements/reservation.md', sourceText(repo.root, SECTION_FROM)) },
    ]);
  });

  it('承認の記録 (approve の行) は書き換えず、載せ替えの行が承認の代わりにもならない', () => {
    const repo = makeLegacyRepo();
    rebase(repo);
    const rows = parseLedgerLines(readLedgerBytes(repo));
    assert.deepEqual(rows[1], JSON.parse(repo.ledgerLines[1] ?? ''));
    assert.equal(rows.filter((r) => r['event'] === 'approve').length, 1);
  });

  it('台帳の指紋が今の本文と一致しない章・由来は、対応表に載せない (触らない)', () => {
    const repo = makeLegacyRepo();
    write(repo.root, 'docs/requirements/reservation.md', reservationDoc({ supplement: '別の本文。' })); // 節 2. 補足 を変更
    write(repo.root, CHAPTER, chapterDoc().replace('補足です。', '補足です (改訂)。')); // 章の本文を変更
    const result = rebase(repo);
    const row = parseLedgerLines(readLedgerBytes(repo)).at(-1);
    assert.deepEqual((row?.['entries'] as { target: string }[]).map((e) => e.target), [ROW_FROM], '一致した REQ-101 だけ');
    const kept = result.kept.filter((i) => i.file.endsWith('agreements.ledger.jsonl')).map((i) => i.target);
    assert.deepEqual(kept, ['提出 1.0 01-reservation.md chapterFingerprint', `提出 1.0 01-reservation.md ${SECTION_FROM}`]);
  });

  it('何も一致しなければ、台帳に行を足さない', () => {
    const repo = makeLegacyRepo();
    write(repo.root, 'docs/requirements/reservation.md', reservationDoc({ row101: ROW_101.replace('30 日前', '60 日前'), supplement: '別の本文。' }));
    write(repo.root, CHAPTER, chapterDoc().replace('補足です。', '補足です (改訂)。'));
    const before = readLedgerBytes(repo);
    rebase(repo);
    assert.equal(readLedgerBytes(repo), before);
  });

  it('(f) 載せ替え前の台帳を v2 として読む agreement-check は、載せ替えた後も ok のまま', () => {
    const repo = makeLegacyRepo();
    rebase(repo);
    const { report, warnings } = runAgreement(repo.root);
    assert.equal(report.exitCode, 0, report.format());
    assert.deepEqual(warnings, []);
  });

  it('(f) 本文を変えれば、載せ替えた後でも再合意が要る (対応表は「同じ本文」にしか効かない)', () => {
    const repo = makeLegacyRepo();
    rebase(repo);
    write(repo.root, 'docs/requirements/reservation.md', reservationDoc({ row101: ROW_101.replace('30 日前', '60 日前') }));
    const { report } = runAgreement(repo.root);
    assert.equal(report.exitCode, 1, report.format());
    assert.match(report.format(), /再合意が要る.*reservation-flow\/REQ-101/);
  });

  it('基準より前の提出は、もう基準にならないので載せ替えない (触らず、触らなかったとも出さない)', () => {
    const repo = makeLegacyRepo();
    // 1.0 (承認済み) の後に、同じ内容の 1.1 を提出して承認する。基準は 1.1。1.0 の保存値は古い本文のもの
    const oldExport = JSON.parse(repo.ledgerLines[0] ?? '') as Record<string, unknown>;
    const stale = { ...oldExport, version: '0.9', chapters: [{ file: '01-reservation.md', chapterFingerprint: 'sha256:stale', sources: [{ from: ROW_FROM, fingerprint: 'sha256:stale' }] }] };
    writeFileSync(ledgerPathFor(repo.submissionDir), `${[JSON.stringify(stale), ...repo.ledgerLines].join('\n')}\n`);
    const result = rebase(repo);
    assert.deepEqual(result.violations, []);
    assert.equal(result.kept.filter((i) => i.target.includes('提出 0.9')).length, 0);
    assert.ok(result.rebased.some((i) => i.target.includes('提出 1.0')));
  });

  it('既に今の版 (v3) の提出は載せ替えない', () => {
    const repo = makeLegacyRepo();
    const exportRow = JSON.parse(repo.ledgerLines[0] ?? '') as AgreementExportEvent;
    appendRows(repo, [{ ...exportRow, version: '2.0', normalizationVersion: 3 }, { event: 'approve', targetVersion: '2.0', approvedBy: '発注側', approvedAt: '2026-02-01' }]);
    const before = readLedgerBytes(repo);
    const result = rebase(repo);
    assert.equal(readLedgerBytes(repo), before);
    assert.equal(result.rebased.filter((i) => i.file.endsWith('agreements.ledger.jsonl')).length, 0);
  });

  it('保存した版の実装が無い提出 (この Igeta より新しい版) は触らず、確かめられないと出す', () => {
    const repo = makeLegacyRepo();
    const exportRow = JSON.parse(repo.ledgerLines[0] ?? '') as Record<string, unknown>;
    writeFileSync(ledgerPathFor(repo.submissionDir), `${[JSON.stringify({ ...exportRow, normalizationVersion: 99 }), repo.ledgerLines[1]].join('\n')}\n`);
    const before = readLedgerBytes(repo);
    const result = rebase(repo);
    assert.equal(readLedgerBytes(repo), before);
    assert.match(result.kept.find((i) => i.file.endsWith('agreements.ledger.jsonl'))?.detail ?? '', /版 99 の実装が無く確かめられない/);
  });

  it('壊れた台帳は検査不能として返す (黙って読み飛ばさず、追記もしない)', () => {
    const repo = makeLegacyRepo();
    appendFileSyncRaw(ledgerPathFor(repo.submissionDir), 'これは JSON ではない\n');
    const before = readLedgerBytes(repo);
    const result = rebase(repo);
    assert.equal(result.violations.length, 1);
    assert.equal(readLedgerBytes(repo), before);
  });

  it('末尾が改行で終わっていない台帳には追記しない (検査不能として返す)', () => {
    const repo = makeLegacyRepo();
    const path = ledgerPathFor(repo.submissionDir);
    writeFileSync(path, readFileSync(path, 'utf8').replace(/\n$/, ''));
    const before = readFileSync(path, 'utf8');
    const result = rebase(repo);
    assert.equal(readFileSync(path, 'utf8'), before);
    assert.ok(result.violations.some((v) => v.severity === 'cannot-check' && v.message.includes('末尾が改行で終わっていない')));
  });

  it('dir を提出物のディレクトリにすると、その下の由来と台帳だけが対象 (正本は docs 全体から引く)', () => {
    const repo = makeLegacyRepo();
    const result = rebase(repo, { dir: repo.submissionDir });
    assert.equal(result.rebased.filter((i) => i.file === CHAPTER).length, 3);
    assert.ok(result.rebased.some((i) => i.file === `${SUBMISSION}/agreements.ledger.jsonl`));
    const nothing = rebase(repo, { dir: join(repo.root, 'docs/glossary') });
    assert.deepEqual(nothing.rebased, []);
  });
});

describe('fingerprint-rebase → 文書を動かす (docs-migrate が行う順序: 先に載せ替え、後でリンクを書き換える)', () => {
  it('(f) 載せ替えてから、章・正本・提出物を動かしてリンクを書き換えても、provenance-check も agreement-check も ok のまま', () => {
    const repo = makeLegacyRepo();
    rebase(repo);
    relocate(repo);
    const provenance = runProvenance(repo.root);
    assert.equal(provenance.report.exitCode, 0, provenance.report.format());
    assert.deepEqual(provenance.warnings, []);
    const agreement = runAgreement(repo.root);
    assert.equal(agreement.report.exitCode, 0, agreement.report.format());
    assert.deepEqual(agreement.warnings, []);
  });

  it('対照: 載せ替えずに動かすと、v2 の指紋はリンクの書き換えで変わるので、stale・再合意が出る (載せ替えが効いている証拠)', () => {
    const repo = makeLegacyRepo();
    relocate(repo);
    const provenance = runProvenance(repo.root);
    assert.equal(provenance.report.exitCode, 1, provenance.report.format());
    assert.match(provenance.report.format(), /orphan-content/);
    const agreement = runAgreement(repo.root);
    assert.equal(agreement.report.exitCode, 1, agreement.report.format());
    assert.match(agreement.report.format(), /章の本文が承認した版 1\.0 から変わった/);
  });

  it('動かした後でも、本文が変われば検出する (対応表が効くのは同じ本文だけ)', () => {
    const repo = makeLegacyRepo();
    rebase(repo);
    relocate(repo);
    write(repo.root, 'docs/ai/requirements/reservation.md', reservationDoc({ supplement: '別の本文。' }));
    const provenance = runProvenance(repo.root);
    assert.match(provenance.report.format(), new RegExp(`${ANCHOR_SECTION}: stale`));
    const agreement = runAgreement(repo.root);
    assert.equal(agreement.report.exitCode, 1, agreement.report.format());
  });
});

describe('fingerprint-rebase: 状態の列だけを足した行 (stateColumnRows、ADR-0006 決定 6 (b))', () => {
  const withState = (row: string, state: string): string => `${row} ${state} |`;
  const stateTable = (overrides: { row101?: string } = {}): string =>
    reservationDoc({
      header: '| ID | 要件 | 備考 | 状態 |',
      separator: '|---|---|---|---|',
      row101: overrides.row101 ?? withState(ROW_101, '確定'),
      row102: withState(ROW_102, '確定'),
    });
  const oldRows = new Map<string, StateColumnRow>([[ROW_FROM, { oldRow: ROW_101 }]]);

  it('(g) 状態の列だけを足した行は載せ替わる。sidecar は新しい行の v3、台帳の対応表は保存値 → 新しい行の v3', () => {
    const repo = makeLegacyRepo();
    const before = readEntries(repo.chapterPath);
    write(repo.root, 'docs/requirements/reservation.md', stateTable());
    const result = rebase(repo, { stateColumnRows: oldRows });
    assert.deepEqual(result.violations, []);

    const newRow = withState(ROW_101, '確定');
    const entry = readEntries(repo.chapterPath)[0];
    assert.ok(entry !== undefined && entry.from !== null);
    assert.equal(entry.fingerprint, v3Of(repo.root, 'docs/requirements/reservation.md', newRow));
    assert.equal(entry.rebasedFrom, before[0] !== undefined && before[0].from !== null ? before[0].fingerprint : undefined);
    assert.equal(entry.acceptedBy, 'reviewer@example.com');

    const row = parseLedgerLines(readLedgerBytes(repo)).at(-1);
    const mapped = (row?.['entries'] as { target: string; to: string }[]).find((e) => e.target === ROW_FROM);
    assert.equal(mapped?.to, v3Of(repo.root, 'docs/requirements/reservation.md', newRow));
  });

  it('(g) 載せ替えた後は、provenance-check も agreement-check も ok (列を足しただけでは再合意が出ない)', () => {
    const repo = makeLegacyRepo();
    write(repo.root, 'docs/requirements/reservation.md', stateTable());
    rebase(repo, { stateColumnRows: oldRows });
    const provenance = runProvenance(repo.root);
    assert.equal(provenance.report.exitCode, 0, provenance.report.format());
    const agreement = runAgreement(repo.root);
    assert.equal(agreement.report.exitCode, 0, agreement.report.format());
    assert.deepEqual(agreement.warnings, []);
  });

  it('(g) 対照: 元の行を渡さなければ (通常の載せ替えだけ) 載せ替わらず、stale・再合意が出る', () => {
    const repo = makeLegacyRepo();
    write(repo.root, 'docs/requirements/reservation.md', stateTable());
    const result = rebase(repo);
    assert.match(result.kept.find((i) => i.target === ANCHOR_ROW)?.detail ?? '', /版 2 で計算した今の本文が保存値と違う/);
    assert.match(runProvenance(repo.root).report.format(), new RegExp(`${ANCHOR_ROW}: stale`));
    assert.match(runAgreement(repo.root).report.format(), /再合意が要る.*REQ-101/);
  });

  it('(g) 他の文字も変えた行 (30 日前 → 60 日前 と列の追加) は載せ替わらない', () => {
    const repo = makeLegacyRepo();
    const before = readEntries(repo.chapterPath);
    write(repo.root, 'docs/requirements/reservation.md', stateTable({ row101: withState(ROW_101.replace('30 日前', '60 日前'), '確定') }));
    const ledgerBefore = readLedgerBytes(repo);
    const result = rebase(repo, { stateColumnRows: oldRows });
    assert.deepEqual(readEntries(repo.chapterPath)[0], before[0]);
    assert.match(result.kept.find((i) => i.target === ANCHOR_ROW)?.detail ?? '', /元の行 \+ 状態の列/);
    const row = parseLedgerLines(readLedgerBytes(repo)).at(-1);
    assert.equal(
      (row?.['entries'] as { target: string }[]).some((e) => e.target === ROW_FROM),
      false,
      '台帳の対応表にも載らない',
    );
    assert.ok(readLedgerBytes(repo).startsWith(ledgerBefore));
    assert.match(runAgreement(repo.root).report.format(), /再合意が要る.*REQ-101/);
  });

  it('(g) 元の行を渡しても、元の行が保存値と一致しなければ (既に stale だった) 載せ替わらない', () => {
    const repo = makeLegacyRepo();
    const before = readEntries(repo.chapterPath);
    write(repo.root, 'docs/requirements/reservation.md', stateTable());
    const result = rebase(repo, { stateColumnRows: new Map([[ROW_FROM, { oldRow: ROW_101.replace('30 日前', '45 日前') }]]) });
    assert.deepEqual(readEntries(repo.chapterPath)[0], before[0]);
    assert.match(result.kept.find((i) => i.target === ANCHOR_ROW)?.detail ?? '', /版 2 で計算した今の本文が保存値と違う/);
  });

  it('(g) 状態の列を足していない行は、元の行を渡しても通常の載せ替えで載せ替わる (リンクだけが理由の v2 → v3)', () => {
    const repo = makeLegacyRepo();
    const result = rebase(repo, { stateColumnRows: oldRows });
    assert.equal(readEntries(repo.chapterPath)[0]?.normalizationVersion, 3);
    assert.equal(result.rebased.some((i) => i.target === ANCHOR_ROW), true);
  });
});

/** テストで台帳に壊れた行を足す (appendLedgerEvent は壊れた行を作れない)。 */
function appendFileSyncRaw(path: string, text: string): void {
  writeFileSync(path, readFileSync(path, 'utf8') + text);
}
