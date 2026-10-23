// node --test dist/core/decision/history.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkAppendOnly, checkStatusMatchesHistory, checkTransitions } from './check/history-rules.js';
import { appendHistoryRow, parseHistory } from './history.js';
import type { NewHistoryRow } from './history.js';

const row = (patch: Partial<NewHistoryRow> = {}): NewHistoryRow => ({
  date: '2026-10-05', event: '承認', before: 'proposed', after: 'accepted', by: 'CEO',
  evidence: 'https://github.com/a/b/pull/1', commit: 'a'.repeat(40), fingerprint: `sha256:${'b'.repeat(64)}`, memo: '', ...patch,
});
const parse = (text: string) => parseHistory(text.split('\n'));

describe('履歴の読み書き', () => {
  it('節が無ければ末尾に作り、2 行目は表の末尾に足す。空のセルは — で書いて空として読む', () => {
    const once = appendHistoryRow('# 題\n\n本文\n', row());
    const twice = appendHistoryRow(once, row({ event: '改訂', before: 'accepted', after: 'amended', memo: 'a|b' }));
    const rows = parse(twice).rows;
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.memo, '');
    assert.equal(rows[1]?.memo, 'a|b');
    assert.equal(rows[1]?.before, 'accepted');
    assert.ok(twice.startsWith('# 題\n\n本文\n'));
  });
});

describe('履歴の節', () => {
  it('見出しはあるが表が無いとき、frontmatter を壊さず見出しの直後に表を作る', () => {
    const text = '---\nid: adr-0001-x\nstatus: proposed\n---\n\n# 題\n\n## 承認の履歴\n\n後ろの文章。\n';
    const out = appendHistoryRow(text, row());
    assert.ok(out.startsWith('---\nid: adr-0001-x\nstatus: proposed\n---\n'));
    assert.equal(parse(out).rows.length, 1);
    assert.ok(out.indexOf('| 日付 |') > out.indexOf('## 承認の履歴') && out.indexOf('| 日付 |') < out.indexOf('後ろの文章'));
  });
});

describe('DS3 / DS9 / DS7', () => {
  const rows = (...patches: Partial<NewHistoryRow>[]) => parse(patches.reduce((text, patch) => appendHistoryRow(text, row(patch)), '# 題\n')).rows;
  it('DS3: 行が無い proposed は通り、行が無い accepted と、最後の「後」が違う status は違反', () => {
    assert.deepEqual(checkStatusMatchesHistory('proposed', []), []);
    assert.equal(checkStatusMatchesHistory('accepted', []).length, 1);
    assert.equal(checkStatusMatchesHistory('proposed', rows({})).length, 1);
    assert.deepEqual(checkStatusMatchesHistory('accepted', rows({})), []);
  });
  it('DS9: rejected から先へは進めない。差戻しはメモが要る。deprecated にする書き込み口は無い', () => {
    assert.equal(checkTransitions(rows({ event: '承認', before: 'rejected' })).length, 1);
    assert.equal(checkTransitions(rows({ event: '差戻し', before: 'accepted', after: 'proposed', memo: '' })).length, 1);
    assert.deepEqual(checkTransitions(rows({ event: '差戻し', before: 'accepted', after: 'proposed', memo: 'accepted 2026-10-01' })), []);
    assert.equal(checkTransitions(rows({ event: '置換', before: 'accepted', after: 'deprecated' })).length, 2);
    assert.deepEqual(checkTransitions(rows({ event: '移行前', before: '未記入', after: 'deprecated' })), []);
  });
  it('DS7: 末尾の追加は通り、過去の行の変更・消去・行なしの状態変更は違反', () => {
    const base = { status: 'accepted', rows: rows({}) };
    assert.deepEqual(checkAppendOnly(base, { status: 'amended', rows: rows({}, { event: '改訂', before: 'accepted', after: 'amended' }) }), []);
    assert.equal(checkAppendOnly(base, { status: 'accepted', rows: rows({ by: '別人' }) }).length, 1);
    assert.equal(checkAppendOnly(base, { status: 'accepted', rows: [] }).length, 1);
    assert.equal(checkAppendOnly(base, { status: 'amended', rows: rows({}) }).length, 1);
  });
});
