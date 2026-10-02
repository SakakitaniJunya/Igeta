// node --test dist/core/AgreementLedger.test.js
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendLedgerEvent,
  exportNormalizationVersion,
  findBaseline,
  followRedirect,
  ledgerPathFor,
  readLedger,
  rebaseKey,
  rebaseTable,
  sourceRedirects,
} from './AgreementLedger.js';
import type { AgreementEvent, AgreementExportEvent } from './AgreementLedger.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'igeta-ledger-'));
  workspaces.push(dir);
  return dir;
}

describe('AgreementLedger', () => {
  it('無ければ absent', () => {
    assert.deepEqual(readLedger(makeDir()), { kind: 'absent' });
  });

  it('export → approve を追記して読み返す', () => {
    const dir = makeDir();
    const exportEvent: AgreementEvent = {
      event: 'export',
      version: '1.0.0',
      date: '2026-09-30',
      manifest: '../design-document.json',
      omitSections: ['関連'],
      chapters: [{ file: '02-reservation.md', chapterFingerprint: 'sha256:aaa', sources: [{ from: 'reservation-flow/REQ-114', fingerprint: 'sha256:bbb' }] }],
    };
    const approveEvent: AgreementEvent = {
      event: 'approve',
      targetVersion: '1.0.0',
      approvedBy: '発注側の責任者',
      approvedAt: '2026-10-02',
    };
    appendLedgerEvent(dir, exportEvent);
    appendLedgerEvent(dir, approveEvent);
    const result = readLedger(dir);
    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') assert.deepEqual(result.events, [exportEvent, approveEvent]);
  });

  it('CannotCheck: 壊れた行 (JSON でない)', () => {
    const dir = makeDir();
    writeFileSync(ledgerPathFor(dir), '{ not json\n');
    const result = readLedger(dir);
    assert.equal(result.kind, 'invalid');
  });

  it('CannotCheck: event が export/approve のどちらでもない', () => {
    const dir = makeDir();
    writeFileSync(ledgerPathFor(dir), `${JSON.stringify({ event: 'x' })}\n`);
    const result = readLedger(dir);
    assert.equal(result.kind, 'invalid');
  });

  it('CannotCheck: export に必須項目が無い', () => {
    const dir = makeDir();
    writeFileSync(ledgerPathFor(dir), `${JSON.stringify({ event: 'export', version: '1.0.0' })}\n`);
    const result = readLedger(dir);
    assert.equal(result.kind, 'invalid');
  });

  it('CannotCheck: approve に approvedBy が無い', () => {
    const dir = makeDir();
    writeFileSync(ledgerPathFor(dir), `${JSON.stringify({ event: 'approve', targetVersion: '1.0.0', approvedAt: '2026-10-02' })}\n`);
    const result = readLedger(dir);
    assert.equal(result.kind, 'invalid');
  });

  it('追記のみ: 既存の行は書き換わらない', () => {
    const dir = makeDir();
    const first: AgreementEvent = { event: 'approve', targetVersion: '1.0.0', approvedBy: 'a', approvedAt: '2026-10-01' };
    const second: AgreementEvent = { event: 'approve', targetVersion: '1.1.0', approvedBy: 'b', approvedAt: '2026-10-02' };
    appendLedgerEvent(dir, first);
    appendLedgerEvent(dir, second);
    const result = readLedger(dir);
    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') {
      assert.equal(result.events.length, 2);
      assert.deepEqual(result.events[0], first);
    }
  });
});

const exportRow = (version: string, extra: Partial<AgreementExportEvent> = {}): AgreementExportEvent => ({
  event: 'export',
  version,
  date: '2026-09-30',
  manifest: 'deliverable.json',
  omitSections: ['関連'],
  chapters: [{ file: '01.md', chapterFingerprint: 'sha256:c', sources: [{ from: 'doc/REQ-101', fingerprint: 'sha256:s' }] }],
  ...extra,
});
const approveRow = (version: string): AgreementEvent => ({ event: 'approve', targetVersion: version, approvedBy: '発注側', approvedAt: '2026-10-01' });
const rebaseRow = (entries: { file: string; target: string; from: string; to: string }[], extra: { toVersion?: number } = {}): AgreementEvent => ({
  event: 'fingerprint-rebase', date: '2026-10-02', rebasedBy: 'igeta', fromVersion: 2, toVersion: extra.toVersion ?? 3, entries,
});
const moveRow = (from: string, to: string): AgreementEvent => ({ event: 'source-move', date: '2026-10-02', movedBy: 'igeta', from, to });

describe('AgreementLedger: export の normalizationVersion', () => {
  it('版を持つ行は読み返しても版が残り、持たない行は版の項目が増えない (過去の行のまま)', () => {
    const dir = makeDir();
    const withVersion = exportRow('2.0', { normalizationVersion: 3 });
    const legacy = exportRow('1.0');
    appendLedgerEvent(dir, legacy);
    appendLedgerEvent(dir, withVersion);
    const result = readLedger(dir);
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.deepEqual(result.events, [legacy, withVersion]);
    assert.equal('normalizationVersion' in (result.events[0] ?? {}), false);
  });

  it('版を持たない行は v2 として扱う (項目ができる前にリリースされた正規化は v2 だけ)', () => {
    assert.equal(exportNormalizationVersion(exportRow('1.0')), 2);
    assert.equal(exportNormalizationVersion(exportRow('2.0', { normalizationVersion: 3 })), 3);
  });

  it('CannotCheck: normalizationVersion が正の整数でない', () => {
    for (const bad of [0, -1, 2.5, '3', null]) {
      const dir = makeDir();
      writeFileSync(ledgerPathFor(dir), `${JSON.stringify({ ...exportRow('1.0'), normalizationVersion: bad })}\n`);
      assert.equal(readLedger(dir).kind, 'invalid', JSON.stringify(bad));
    }
  });
});

describe('AgreementLedger: fingerprint-rebase / source-move の行', () => {
  it('書いて読み返すと同じ内容になる (追記のみ。過去の行は 1 バイトも変わらない)', () => {
    const dir = makeDir();
    const events: AgreementEvent[] = [exportRow('1.0'), approveRow('1.0')];
    for (const event of events) appendLedgerEvent(dir, event);
    const before = readFileSync(ledgerPathFor(dir), 'utf8');
    const rebase = rebaseRow([
      { file: '01.md', target: 'chapterFingerprint', from: 'sha256:c', to: 'sha256:c3' },
      { file: '01.md', target: 'doc/REQ-101', from: 'sha256:s', to: 'sha256:s3' },
    ]);
    const move = moveRow('doc/REQ-101', 'doc-2/REQ-101');
    assert.equal(appendLedgerEvent(dir, rebase), null);
    assert.equal(appendLedgerEvent(dir, move), null);
    const after = readFileSync(ledgerPathFor(dir), 'utf8');
    assert.ok(after.startsWith(before), '既存の行は書き換わらない');
    assert.equal(after.slice(before.length).split('\n').filter((l) => l !== '').length, 2, '追記は 2 行だけ');
    const result = readLedger(dir);
    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') assert.deepEqual(result.events, [...events, rebase, move]);
  });

  it('CannotCheck: fingerprint-rebase の形が不正 (必須項目の欠落・版・entries の要素・提出物の外のパス)', () => {
    const valid = { event: 'fingerprint-rebase', date: '2026-10-02', rebasedBy: 'igeta', fromVersion: 2, toVersion: 3, entries: [{ file: '01.md', target: 'chapterFingerprint', from: 'a', to: 'b' }] };
    const broken: Record<string, unknown>[] = [
      { ...valid, date: undefined },
      { ...valid, rebasedBy: '' },
      { ...valid, fromVersion: 0 },
      { ...valid, toVersion: '3' },
      { ...valid, entries: 'x' },
      { ...valid, entries: [null] },
      { ...valid, entries: [{ file: '01.md', target: 'chapterFingerprint', from: 'a' }] },
      { ...valid, entries: [{ file: '../outside.md', target: 'chapterFingerprint', from: 'a', to: 'b' }] },
    ];
    for (const record of broken) {
      const dir = makeDir();
      writeFileSync(ledgerPathFor(dir), `${JSON.stringify(record)}\n`);
      assert.equal(readLedger(dir).kind, 'invalid', JSON.stringify(record));
    }
  });

  it('CannotCheck: source-move の形が不正 (必須項目の欠落・from と to が同じ)', () => {
    const valid = { event: 'source-move', date: '2026-10-02', movedBy: 'igeta', from: 'a/REQ-001', to: 'b/REQ-001' };
    const broken: Record<string, unknown>[] = [
      { ...valid, date: undefined },
      { ...valid, movedBy: '' },
      { ...valid, from: undefined },
      { ...valid, to: '' },
      { ...valid, to: valid.from },
    ];
    for (const record of broken) {
      const dir = makeDir();
      writeFileSync(ledgerPathFor(dir), `${JSON.stringify(record)}\n`);
      assert.equal(readLedger(dir).kind, 'invalid', JSON.stringify(record));
    }
  });
});

describe('AgreementLedger: 基準・付け替え・対応表', () => {
  it('findBaseline: 承認が無ければ none、承認済みの版の提出が無ければ export-missing', () => {
    assert.deepEqual(findBaseline([exportRow('1.0')]), { kind: 'none' });
    assert.deepEqual(findBaseline([approveRow('9.9')]), { kind: 'export-missing', versions: ['9.9'] });
  });

  it('findBaseline: 承認済みの版のうち、提出の記録が最も後の版 (承認の記録順ではない) と、その位置', () => {
    const events: AgreementEvent[] = [exportRow('1.0'), exportRow('2.0'), exportRow('3.0'), approveRow('2.0'), approveRow('1.0')];
    const baseline = findBaseline(events);
    assert.equal(baseline.kind, 'ok');
    if (baseline.kind !== 'ok') return;
    assert.equal(baseline.event.version, '2.0');
    assert.equal(baseline.index, 1);
  });

  it('sourceRedirects: 指定した位置より後の source-move だけを、記録順に畳む', () => {
    const events: AgreementEvent[] = [moveRow('a/REQ-1', 'x/REQ-1'), exportRow('1.0'), moveRow('b/REQ-2', 'y/REQ-2'), moveRow('y/REQ-2', 'z/REQ-2')];
    const redirects = sourceRedirects(events, 1);
    assert.equal(followRedirect(redirects, 'a/REQ-1'), 'a/REQ-1', '基準より前の付け替えは効かない');
    assert.equal(followRedirect(redirects, 'b/REQ-2'), 'z/REQ-2', '2 回動かした行は、最後の居場所までたどる');
    assert.equal(followRedirect(redirects, 'nothing/REQ-9'), 'nothing/REQ-9', '付け替えが無ければそのまま');
    assert.equal(followRedirect(sourceRedirects(events, -1), 'a/REQ-1'), 'x/REQ-1', '位置 -1 は全部');
  });

  it('sourceRedirects: A → B のあとに別の行が C → A と入っても、元の A の行は B にある (後から A に入った行へは付け替えない)', () => {
    const redirects = sourceRedirects([moveRow('a/REQ-1', 'b/REQ-1'), moveRow('c/REQ-1', 'a/REQ-1')], -1);
    assert.equal(followRedirect(redirects, 'a/REQ-1'), 'b/REQ-1', '元の A の行は B へ動いたまま');
    assert.equal(followRedirect(redirects, 'c/REQ-1'), 'a/REQ-1', '元の C の行は A にある');
    assert.equal(followRedirect(redirects, 'b/REQ-1'), 'b/REQ-1', '付け替えの元になっていない id はそのまま');
  });

  it('sourceRedirects: 行の入れ替え (A → T、B → A、T → B) は、2 行とも相手のいた場所へ届く', () => {
    const swap: AgreementEvent[] = [moveRow('a/REQ-1', 't/REQ-1'), moveRow('b/REQ-1', 'a/REQ-1'), moveRow('t/REQ-1', 'b/REQ-1')];
    const redirects = sourceRedirects(swap, -1);
    assert.equal(followRedirect(redirects, 'a/REQ-1'), 'b/REQ-1');
    assert.equal(followRedirect(redirects, 'b/REQ-1'), 'a/REQ-1');
    // 途中までなら、途中の居場所 (記録の順に当てる)
    assert.equal(followRedirect(sourceRedirects(swap.slice(0, 2), -1), 'a/REQ-1'), 't/REQ-1');
    assert.equal(followRedirect(sourceRedirects(swap.slice(0, 2), -1), 'b/REQ-1'), 'a/REQ-1');
  });

  it('sourceRedirects: 連鎖 (A → B → C) と、間に別の行の付け替えが挟まる場合も、id ごとに今の居場所を求める', () => {
    const events: AgreementEvent[] = [moveRow('a/REQ-1', 'b/REQ-1'), moveRow('x/REQ-9', 'y/REQ-9'), moveRow('b/REQ-1', 'c/REQ-1'), moveRow('c/REQ-1', 'd/REQ-1')];
    const redirects = sourceRedirects(events, -1);
    assert.equal(followRedirect(redirects, 'a/REQ-1'), 'd/REQ-1');
    assert.equal(followRedirect(redirects, 'x/REQ-9'), 'y/REQ-9');
    assert.equal(followRedirect(redirects, 'y/REQ-9'), 'y/REQ-9');
  });

  it('sourceRedirects: 元の場所へ戻した行も、対応が輪にならない (後の行が勝つ)', () => {
    const events: AgreementEvent[] = [moveRow('a/REQ-1', 'b/REQ-1'), moveRow('b/REQ-1', 'a/REQ-1')];
    const redirects = sourceRedirects(events, -1);
    assert.equal(followRedirect(redirects, 'a/REQ-1'), 'a/REQ-1');
    assert.equal(followRedirect(redirects, 'b/REQ-1'), 'a/REQ-1');
    const three: AgreementEvent[] = [moveRow('a/R-1', 'b/R-1'), moveRow('b/R-1', 'c/R-1'), moveRow('c/R-1', 'a/R-1')];
    const around = sourceRedirects(three, -1);
    for (const from of ['a/R-1', 'b/R-1', 'c/R-1']) assert.equal(followRedirect(around, from), 'a/R-1', from);
  });

  it('rebaseTable: 保存値ごとに直近の対応づけが勝つ。指定した位置より前の行・別の保存値には効かない', () => {
    const entry = (from: string, to: string) => ({ file: '01.md', target: 'chapterFingerprint', from, to });
    const events: AgreementEvent[] = [
      rebaseRow([entry('sha256:old', 'sha256:before-baseline')]),
      exportRow('1.0'),
      rebaseRow([entry('sha256:s2', 'sha256:first')]),
      rebaseRow([entry('sha256:s2', 'sha256:latest')], { toVersion: 4 }),
    ];
    const table = rebaseTable(events, 1);
    assert.deepEqual(table.get(rebaseKey('01.md', 'chapterFingerprint', 'sha256:s2')), { to: 'sha256:latest', toVersion: 4 });
    assert.equal(table.get(rebaseKey('01.md', 'chapterFingerprint', 'sha256:old')), undefined, '基準より前の行は効かない');
    assert.equal(table.get(rebaseKey('01.md', 'chapterFingerprint', 'sha256:other')), undefined, '別の保存値には効かない');
    assert.equal(table.get(rebaseKey('02.md', 'chapterFingerprint', 'sha256:s2')), undefined, '別の章には効かない');
  });
});
