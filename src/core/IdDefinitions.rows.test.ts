// node --test dist/core/IdDefinitions.rows.test.js
// collectRowDefinitions (重複を残し行番号を返す版)。collectRowDefinedTokens の既存のテストは IdDefinitions.test.ts にあり、変えていない。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectRowDefinedTokens, collectRowDefinitions } from './IdDefinitions.js';

describe('collectRowDefinitions', () => {
  it('重複を残したまま、1 始まりの行番号つきで返す。束ねた接頭辞も読む', () => {
    const lines = ['| FN-010 | a |', '', '| FN-010 | b |', '| REQ-101 | c |', '本文の FN-011'];
    assert.deepEqual(collectRowDefinitions(lines, '(?:FN|REQ)'), [
      { token: 'FN-010', line: 1 },
      { token: 'FN-010', line: 3 },
      { token: 'REQ-101', line: 4 },
    ]);
  });

  it('AUTOGEN 区間の行頭セルは数えない (collectRowDefinedTokens と同じ判定)', () => {
    const lines = ['<!-- AUTOGEN:x:start -->', '| OPEN-005 | 索引 |', '<!-- AUTOGEN:x:end -->'];
    assert.deepEqual(collectRowDefinitions(lines, 'OPEN'), []);
  });

  it('collectRowDefinedTokens は重複を 1 件にまとめ、出現順を保つ', () => {
    assert.deepEqual(collectRowDefinedTokens(['| FN-010 | a |', '| FN-002 | b |', '| FN-010 | c |'], 'FN'), ['FN-010', 'FN-002']);
  });
});
