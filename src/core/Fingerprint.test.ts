// node --test dist/core/Fingerprint.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeFingerprint, normalizeForFingerprint } from './Fingerprint.js';

describe('computeFingerprint', () => {
  it('CRLF と LF は同じ指紋になる', () => {
    assert.equal(computeFingerprint('a\r\nb\r\n'), computeFingerprint('a\nb\n'));
  });

  it('行末の空白は指紋に影響しない', () => {
    assert.equal(computeFingerprint('予約の受付   \n内容'), computeFingerprint('予約の受付\n内容'));
  });

  it('表の列幅をそろえる空白・区切り線の - の数は指紋に影響しない', () => {
    const a = ['| ID | 内容 |', '|---|---|', '| REQ-001 | 予約を受け付ける |'].join('\n');
    const b = ['| ID       | 内容            |', '|----------|-----------------|', '| REQ-001  | 予約を受け付ける |'].join('\n');
    assert.equal(computeFingerprint(a), computeFingerprint(b));
  });

  it('セル内容そのものが変わると指紋も変わる', () => {
    const a = '| REQ-001 | 予約を受け付ける |';
    const b = '| REQ-001 | 予約を確定する |';
    assert.notEqual(computeFingerprint(a), computeFingerprint(b));
  });

  it('本文の内容が変わると指紋が変わる', () => {
    assert.notEqual(computeFingerprint('予約の受付は 30 日前まで'), computeFingerprint('予約の受付は 60 日前まで'));
  });

  it('全角・半角の文字そのものは変換しない (連続する空白だけを正規化する)', () => {
    assert.notEqual(normalizeForFingerprint('３０日'), normalizeForFingerprint('30日'));
  });
});
