// node --test dist/core/decision/index.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adrText, approvalRow } from './adr.test-support.js';
import { checkIndexMarks, checkReopens, checkSupersession, checkWaiting, daysBetween, editFrontmatter, indexLinkOf, parseDecision, renderDecisionIndex } from './index.js';
import type { DecisionDoc } from './index.js';

const doc = (path: string, text: string): DecisionDoc => {
  const parsed = parseDecision(path, text);
  if (!('doc' in parsed)) throw new Error(parsed.reason);
  return parsed.doc;
};
const D = 'docs/person/decisions';

describe('索引の 4 つの表 (DS14)', () => {
  const docs = [
    doc(`${D}/proposed/0002-b.md`, adrText({ number: '0002', slug: 'b', extra: { awaiting: 'CEO', due: '2026-12-01' } })),
    doc(`${D}/accepted/2026/0001-a.md`, adrText({ number: '0001', slug: 'a', status: 'accepted', rows: [approvalRow({ commit: 'a'.repeat(40), fingerprint: 'sha256:x' })] })),
  ];
  it('[TST-107] 同じ集合は同じ出力で、経過日数を入れない。0 件の表は _該当なし_', () => {
    const first = renderDecisionIndex(docs, indexLinkOf);
    assert.equal(first, renderDecisionIndex([...docs].reverse(), indexLinkOf));
    assert.ok(first.includes('| [0002](proposed/0002-b.md)'));
    assert.ok(first.includes('PR #7'));
    assert.ok(first.includes('CEO'));
    assert.equal((first.match(/_該当なし_/g) ?? []).length, 2);
    assert.ok(!/日待ち|経過/.test(first));
    assert.deepEqual(checkIndexMarks(first.split('\n')), []);
  });
  it('印が表の見出しと合わない行は違反', () => {
    const bad = renderDecisionIndex(docs, indexLinkOf).replace('| ⏳ 承認待ち |', '| ✅ 承認済 |');
    assert.equal(checkIndexMarks(bad.split('\n')).length, 1);
  });
});

describe('置換・再提案・待ち', () => {
  it('DS8: 新が承認済なのに旧が accepted のままは違反', () => {
    const old = doc(`${D}/accepted/2026/0001-a.md`, adrText({ number: '0001', slug: 'a', status: 'accepted', extra: { superseded_by: 'adr-0002-b' } }));
    const next = doc(`${D}/accepted/2026/0002-b.md`, adrText({ number: '0002', slug: 'b', status: 'accepted', extra: { supersedes: '[adr-0001-a]' } }));
    assert.equal(checkSupersession([old, next]).length, 1);
  });
  it('DS8: 新が承認済なのに旧が amended のままでも違反 (まだ効いている)', () => {
    const old = doc(`${D}/accepted/2026/0001-a.md`, adrText({ number: '0001', slug: 'a', status: 'amended', extra: { superseded_by: 'adr-0002-b' } }));
    const next = doc(`${D}/accepted/2026/0002-b.md`, adrText({ number: '0002', slug: 'b', status: 'accepted', extra: { supersedes: '[adr-0001-a]' } }));
    assert.equal(checkSupersession([old, next]).length, 1);
  });
  it('DS10: 存在しない・rejected でない相手を指す reopens は違反', () => {
    const lonely = doc(`${D}/proposed/0003-c.md`, adrText({ number: '0003', slug: 'c', extra: { reopens: 'adr-0009-z' } }));
    assert.equal(checkReopens([lonely]).length, 1);
  });
  it('DS11: created が無い・形式違いでも NaN を出さず、起点を辿れない警告 1 行にする', () => {
    const d = doc(`${D}/proposed/0003-c.md`, adrText({ number: '0003', slug: 'c', extra: { awaiting: 'A', created: '来週' } }));
    const result = checkWaiting(d, { isStrict: true, approverNames: ['A'], staleDays: 14, today: '2026-10-22', waitingSince: { date: d.created, isFromGit: false } });
    assert.equal(result.warnings.length, 1);
    assert.doesNotMatch(result.warnings[0] ?? '', /NaN/);
    assert.match(result.warnings[0] ?? '', /起点を辿れない/);
  });
  it('DS11: ちょうど staleDays は警告にならず、超えれば警告。差戻し直後の持ち主が無いと strict では違反', () => {
    const d = doc(`${D}/proposed/0003-c.md`, adrText({ number: '0003', slug: 'c', extra: { awaiting: 'A' } }));
    const context = { isStrict: true, approverNames: ['A'], staleDays: 14, today: '2026-10-22', waitingSince: { date: '2026-10-08', isFromGit: true } };
    assert.deepEqual(checkWaiting(d, context).warnings, []);
    assert.equal(checkWaiting(d, { ...context, waitingSince: { date: '2026-10-07', isFromGit: false } }).warnings.length, 1);
    const noOwner = doc(`${D}/proposed/0004-d.md`, adrText({ number: '0004', slug: 'd' }));
    assert.equal(checkWaiting(noOwner, context).findings.length, 1);
    assert.equal(daysBetween('2026-10-01', '2026-10-22'), 21);
  });
});

describe('editFrontmatter', () => {
  it('項目を直す・消す・足す。リスト形式の項目は項目ごと消える', () => {
    const text = '---\nid: x\nawaiting: A\nsupersedes:\n  - a\n  - b\nstatus: proposed\n---\n\n本文\n';
    const out = editFrontmatter(text, { status: 'accepted', awaiting: undefined, supersedes: undefined, superseded_by: 'y' });
    assert.equal(out, '---\nid: x\nstatus: accepted\nsuperseded_by: y\n---\n\n本文\n');
  });
});
