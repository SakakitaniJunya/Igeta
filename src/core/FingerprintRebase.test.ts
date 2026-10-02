// node --test dist/core/FingerprintRebase.test.js
// 載せ替えの判断 (ファイルには触らない) だけを確かめる。ファイルを書き換える側は generators/FingerprintRebaseModule.test.ts。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeFingerprint } from './Fingerprint.js';
import type { DestinationRewriter } from './Fingerprint.js';
import { IGETA_ACTOR, decideRebase, decideStateColumnRebase, describeKept, rebasedEntry } from './FingerprintRebase.js';
import type { ProvenanceEntry } from './ProvenanceSidecar.js';
import { lineDiff } from './lineDiff.test-support.js';

/** 行き先 `./a.md` を doc-a、`../a.md` も doc-a に直す (別の深さの文書から同じ文書を指す)。他はそのまま。 */
const rewriteToId: DestinationRewriter = (destination) => (/^(\.\/|\.\.\/)a\.md/.test(destination) ? destination.replace(/^(\.\/|\.\.\/)a\.md/, 'id:doc-a') : destination);

describe('decideRebase (通常の載せ替え)', () => {
  const text = '予約は 30 日前まで。[用語](./a.md#予約)';

  it('保存値の版 (v2) で今の本文が保存値と一致したら、同じ本文から v3 を計算して載せ替える', () => {
    const decision = decideRebase({ stored: computeFingerprint(text, 2), storedVersion: 2, text, rewrite: rewriteToId });
    assert.deepEqual(decision, { kind: 'rebased', fingerprint: computeFingerprint(text, 3, rewriteToId) });
    assert.notEqual(computeFingerprint(text, 2), computeFingerprint(text, 3, rewriteToId), '本文にリンクがあるので v2 と v3 は違う値 (載せ替えが意味を持つ)');
  });

  it('保存値の版で一致しなければ触らない (mismatch)。v3 で計算したら一致する本文でも、保存値が v2 なら載せ替えない', () => {
    const stale = decideRebase({ stored: computeFingerprint('予約は 60 日前まで。', 2), storedVersion: 2, text, rewrite: rewriteToId });
    assert.deepEqual(stale, { kind: 'kept', reason: 'mismatch' });
    // 保存値は v3 で計算した値だが、版は 2 と名乗っている (版番号だけを見て一致とみなさない)
    const wrongVersion = decideRebase({ stored: computeFingerprint(text, 3, rewriteToId), storedVersion: 2, text, rewrite: rewriteToId });
    assert.deepEqual(wrongVersion, { kind: 'kept', reason: 'mismatch' });
  });

  it('保存値の版の実装が無ければ「確かめられない」として載せ替えない (unverifiable)', () => {
    assert.deepEqual(decideRebase({ stored: computeFingerprint(text, 2), storedVersion: 1, text, rewrite: rewriteToId }), { kind: 'kept', reason: 'unverifiable' });
    assert.deepEqual(decideRebase({ stored: 'sha256:0', storedVersion: 0, text, rewrite: rewriteToId }), { kind: 'kept', reason: 'unverifiable' });
  });
});

describe('decideStateColumnRebase (状態の列だけを足した行)', () => {
  const oldRow = '| REQ-101 | 予約は 30 日前まで ([用語集](./a.md#予約)) | 備考 A |';
  const stored = computeFingerprint(oldRow, 2);
  const target = (newRow: string, overrides: Partial<Parameters<typeof decideStateColumnRebase>[0]> = {}): Parameters<typeof decideStateColumnRebase>[0] => ({
    stored, storedVersion: 2, oldRow, oldRewrite: rewriteToId, newRow, newRewrite: rewriteToId, ...overrides,
  });

  it('元の行が保存値と一致し、新しい行から最後の列を除くと元の行になるときだけ、新しい行から v3 を計算して載せ替える', () => {
    const newRow = '| REQ-101 | 予約は 30 日前まで ([用語集](./a.md#予約)) | 備考 A | 確定 |';
    assert.deepEqual(decideStateColumnRebase(target(newRow)), { kind: 'rebased', fingerprint: computeFingerprint(newRow, 3, rewriteToId) });
  });

  it('列幅などの整形の違いは無視して比べる', () => {
    const newRow = '| REQ-101   |  予約は 30 日前まで ([用語集](./a.md#予約))  | 備考 A    | 確定 |';
    assert.equal(decideStateColumnRebase(target(newRow)).kind, 'rebased');
  });

  it('状態の列に当たる値は問わない (空でもよい)', () => {
    assert.equal(decideStateColumnRebase(target('| REQ-101 | 予約は 30 日前まで ([用語集](./a.md#予約)) | 備考 A | |')).kind, 'rebased');
  });

  it('他の文字も変えた行は載せ替えない (not-state-column)', () => {
    const changed = '| REQ-101 | 予約は 60 日前まで ([用語集](./a.md#予約)) | 備考 A | 確定 |';
    assert.deepEqual(decideStateColumnRebase(target(changed)), { kind: 'kept', reason: 'not-state-column' });
  });

  it('列を足さずに文字だけ変えた行・列を 2 つ足した行・列を先頭や途中に足した行も載せ替えない', () => {
    const base = '予約は 30 日前まで ([用語集](./a.md#予約))';
    for (const newRow of [
      '| REQ-101 | 予約は 60 日前まで ([用語集](./a.md#予約)) | 備考 A |',
      `| REQ-101 | ${base} | 備考 A | 確定 | 担当 |`,
      `| 確定 | REQ-101 | ${base} | 備考 A |`,
      `| REQ-101 | ${base} | 確定 | 備考 A |`,
      `REQ-101 ${base} 備考 A 確定`,
    ]) {
      assert.deepEqual(decideStateColumnRebase(target(newRow)), { kind: 'kept', reason: 'not-state-column' }, newRow);
    }
  });

  it('元の行が保存値と一致しなければ (既に stale)、列を足しただけの行でも載せ替えない (mismatch)', () => {
    const newRow = '| REQ-101 | 予約は 30 日前まで ([用語集](./a.md#予約)) | 備考 A | 確定 |';
    assert.deepEqual(decideStateColumnRebase(target(newRow, { stored: computeFingerprint('| REQ-101 | 別の文 | 備考 A |', 2) })), { kind: 'kept', reason: 'mismatch' });
  });

  it('保存値の版の実装が無ければ確かめられない (unverifiable)', () => {
    const newRow = '| REQ-101 | 予約は 30 日前まで ([用語集](./a.md#予約)) | 備考 A | 確定 |';
    assert.deepEqual(decideStateColumnRebase(target(newRow, { storedVersion: 1 })), { kind: 'kept', reason: 'unverifiable' });
  });

  it('保存値が v3 でも、元の行・新しい行を v3 で (それぞれの文書のリンク解決で) 比べて載せ替える', () => {
    const storedV3 = computeFingerprint(oldRow, 3, rewriteToId);
    const newRow = '| REQ-101 | 予約は 30 日前まで ([用語集](../a.md#予約)) | 備考 A | 確定 |'; // 別の深さの文書で、同じ文書を指す
    const decision = decideStateColumnRebase(target(newRow, { stored: storedV3, storedVersion: 3 }));
    assert.deepEqual(decision, { kind: 'rebased', fingerprint: computeFingerprint(newRow, 3, rewriteToId) });
  });
});

describe('rebasedEntry (sidecar のエントリの載せ替え)', () => {
  const accepted = { capturedBy: 'agent:writer', capturedAt: '2026-09-28', acceptedBy: 'reviewer@example.com', acceptedAt: '2026-09-29', normalizationVersion: 2 } as const;

  it('from あり: 指紋と版を付け替え、載せ替えの記録を足す。承認・capturedBy/At は保つ', () => {
    const entry: ProvenanceEntry = { anchor: '1. 予約', from: 'doc/REQ-101', fingerprint: 'sha256:v2', ...accepted };
    assert.deepEqual(rebasedEntry(entry, 'sha256:v3', '2026-10-02'), {
      anchor: '1. 予約', from: 'doc/REQ-101', fingerprint: 'sha256:v3', ...accepted,
      normalizationVersion: 3, rebasedFrom: 'sha256:v2', rebasedAt: '2026-10-02', rebasedBy: IGETA_ACTOR,
    });
  });

  it('from: null: blockFingerprint を付け替える (fingerprint の項目は足さない)', () => {
    const entry: ProvenanceEntry = { anchor: '2. ご挨拶', from: null, reason: '挨拶', blockFingerprint: 'sha256:v2', ...accepted };
    const next = rebasedEntry(entry, 'sha256:v3', '2026-10-02');
    assert.deepEqual(next, {
      anchor: '2. ご挨拶', from: null, reason: '挨拶', blockFingerprint: 'sha256:v3', ...accepted,
      normalizationVersion: 3, rebasedFrom: 'sha256:v2', rebasedAt: '2026-10-02', rebasedBy: 'igeta',
    });
    assert.equal('fingerprint' in next, false);
  });

  it('項目の並びは変えず、載せ替えの記録は指紋のすぐ後ろに置く。前の載せ替えの記録は置き換える', () => {
    const entry: ProvenanceEntry = {
      anchor: '1. 予約', from: 'doc/REQ-101', fingerprint: 'sha256:v2', capturedBy: 'agent:writer', capturedAt: '2026-09-28',
      normalizationVersion: 2, acceptedBy: 'reviewer@example.com', acceptedAt: '2026-09-29',
    };
    const once = rebasedEntry(entry, 'sha256:v3', '2026-10-02');
    assert.deepEqual(Object.keys(once), ['anchor', 'from', 'fingerprint', 'rebasedFrom', 'rebasedAt', 'rebasedBy', 'capturedBy', 'capturedAt', 'normalizationVersion', 'acceptedBy', 'acceptedAt']);
    const again = rebasedEntry(once, 'sha256:v4', '2026-11-01');
    assert.deepEqual(Object.keys(again), Object.keys(once));
    assert.equal(again.rebasedAt, '2026-11-01');
  });

  it('差分には指紋・版・載せ替えの記録の行だけが出て、承認の行 (最後の項目でも、末尾のカンマも) は動かない', () => {
    const entry: ProvenanceEntry = {
      anchor: '1. 予約', from: 'doc/REQ-101', fingerprint: 'sha256:v2', capturedBy: 'agent:writer', capturedAt: '2026-09-28',
      normalizationVersion: 2, acceptedBy: 'reviewer@example.com', acceptedAt: '2026-09-29',
    };
    const text = (e: ProvenanceEntry): string => JSON.stringify({ sourceDoc: 'x.md', entries: [e] }, null, 2);
    const { removed, added } = lineDiff(text(entry), text(rebasedEntry(entry, 'sha256:v3', '2026-10-02')));
    assert.deepEqual(removed.map((l) => l.trim()), ['"fingerprint": "sha256:v2",', '"normalizationVersion": 2,']);
    assert.deepEqual(added.map((l) => l.trim()), [
      '"fingerprint": "sha256:v3",', '"rebasedFrom": "sha256:v2",', '"rebasedAt": "2026-10-02",', '"rebasedBy": "igeta",', '"normalizationVersion": 3,',
    ]);
  });

  it('未承認のエントリは、未承認のまま (載せ替えが承認を作らない)', () => {
    const entry: ProvenanceEntry = { anchor: 'a', from: 'doc/REQ-101', fingerprint: 'sha256:v2', capturedBy: 'agent:writer', capturedAt: '2026-09-28', normalizationVersion: 2 };
    const next = rebasedEntry(entry, 'sha256:v3', '2026-10-02');
    assert.equal(next.acceptedBy, undefined);
    assert.equal(next.acceptedAt, undefined);
  });
});

describe('describeKept', () => {
  it('触らなかった理由を、保存値の版つきで説明する', () => {
    assert.match(describeKept('mismatch', 2), /版 2 で計算した今の本文が保存値と違う/);
    assert.match(describeKept('unverifiable', 1), /版 1 の実装が無く確かめられない/);
    assert.match(describeKept('not-state-column', 2), /元の行 \+ 状態の列/);
  });
});
