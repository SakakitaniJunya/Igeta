// node --test dist/core/MarkdownTable.test.js
// テスト仕様 03 (docs/design/test/specs/03-person-form.md) §0 の「表」: 見出しの行と区切りの行を持つ。
// コードフェンス・生成区間・HTML コメントの外。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyLines } from './LineClassifier.js';
import { findTables, splitTableRow } from './MarkdownTable.js';

const tablesOf = (lines: readonly string[], from = 0): ReturnType<typeof findTables> => findTables(lines, classifyLines(lines), from);

describe('表 (テスト仕様 03 §0)', () => {
  const TABLE = ['| ID | 決まり | 状態 |', '|---|---|---|', '| BF-101 | a | 決定 |', '| BF-102 | b | 仮 |'];

  it('[定義: 表] 見出しの行と区切りの行を持つ `|` の行のかたまり。見出し・データの行を、1 始まりの行番号つきで読む', () => {
    const tables = tablesOf(['# 題名', '', ...TABLE, '', '| 用語 | 意味 |', '|:--|--:|', '| 予約 | 席 |']);
    assert.equal(tables.length, 2);
    assert.equal(tables[0]?.headerLine, 3);
    assert.deepEqual(tables[0]?.headers, ['ID', '決まり', '状態']);
    assert.deepEqual(tables[0]?.rows, [
      { line: 5, cells: ['BF-101', 'a', '決定'] },
      { line: 6, cells: ['BF-102', 'b', '仮'] },
    ]);
    assert.equal(tables[1]?.headerLine, 8);
    // 区切りの行が無い `|` の行は、表ではない
    assert.deepEqual(tablesOf(['| a | b |', '| c | d |']), []);
  });

  it('[定義: 表] コードフェンス・HTML コメント・生成区間の中は表ではない。frontmatter (from より前) も見ない', () => {
    const lines = [
      '---', '| a | b |', '|---|---|', '---',
      '```markdown', ...TABLE, '```',
      '<!--', ...TABLE, '-->',
      '<!-- AUTOGEN:dir-index:start — generated -->', ...TABLE, '<!-- AUTOGEN:dir-index:end -->',
      ...TABLE,
    ];
    const tables = tablesOf(lines, 4);
    assert.equal(tables.length, 1);
    assert.equal(tables[0]?.headerLine, 23);
  });

  it('[定義: 表] セルは前後の空白を除いて切る。空のセルは残り、エスケープしたパイプ (\\|) は区切りではない', () => {
    assert.deepEqual(splitTableRow('| BF-101 | 予約は成立させない |  決定 |'), ['BF-101', '予約は成立させない', '決定']);
    assert.deepEqual(splitTableRow('| a | | c |'), ['a', '', 'c']);
    assert.deepEqual(splitTableRow('| a \\| b | c |'), ['a \\| b', 'c']);
  });
});
