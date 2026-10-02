// node --test dist/core/FingerprintRebase.test.js
// 載せ替えの判断 (ファイルには触らない) だけを確かめる。ファイルを書き換える側は generators/FingerprintRebaseModule.test.ts。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeFingerprint } from './Fingerprint.js';
import type { DestinationRewriter } from './Fingerprint.js';
import { IGETA_ACTOR, decideRebase, describeKept, rebasedEntry } from './FingerprintRebase.js';
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
  });
});
