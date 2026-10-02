// node --test dist/gate/PathGlob.test.js
// パスの照合 (テスト仕様 01 の R5)。決定 1 の表のパスに、大文字小文字と名前の続きがどう当たるか。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pathRule } from './ApprovalScope.js';

describe('approval-scope: パスの照合 (R5)', () => {
  it('[TST-302] 大文字と小文字を区別しない (docs/Person/x.md・.GitHub/workflows/x.yml は human のパス)', () => {
    for (const path of ['docs/Person/x.md', '.GitHub/workflows/x.yml']) {
      assert.notEqual(pathRule(path, []), null, path);
    }
  });

  it('[TST-309] 名前の続き (docs/personal/・docs/clients/) には当たらない', () => {
    for (const path of ['docs/personal/x.md', 'docs/clients/x.md']) {
      assert.equal(pathRule(path, []), null, path);
    }
  });
});
