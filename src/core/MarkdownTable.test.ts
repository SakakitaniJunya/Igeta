// node --test dist/core/MarkdownTable.test.js
// テスト仕様 03 (docs/design/test/specs/03-person-form.md) §0 の定義「表」: 次の行が区切りの行である見出しの行から始まり、
// 空行・見出し・コードフェンスの始まり・HTML コメントの行の手前まで続く (コードフェンス・生成区間・HTML コメントの外)。
// 見出しと区切りの行頭の縦棒は無くてもよい。表の途中の行は、行頭が縦棒でなくても表の行。引用の中の表は読まない。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyLines } from './LineClassifier.js';
import { findTables, splitTableRow } from './MarkdownTable.js';

const tablesOf = (lines: readonly string[], from = 0): ReturnType<typeof findTables> => findTables(lines, classifyLines(lines), from);

const TABLE = ['| ID | 決まり | 状態 |', '|---|---|---|', '| BF-101 | a | 決定 |', '| BF-102 | b | 仮 |'];

describe('表 (テスト仕様 03 §0)', () => {
  it('[定義: 表] 次の行が区切りの行である見出しの行から始まる。見出しと区切りの行頭の縦棒は無くてもよい。区切りの無い行・縦棒の無い `---` は表ではない', () => {
    const [table] = tablesOf(['# 題名', '', ...TABLE]);
    assert.equal(table?.headerLine, 3);
    assert.deepEqual(table?.headers, ['ID', '決まり', '状態']);
    assert.deepEqual(table?.rows, [
      { line: 5, cells: ['BF-101', 'a', '決定'] },
      { line: 6, cells: ['BF-102', 'b', '仮'] },
    ]);

    const [bare] = tablesOf(['ID | 決まり | 状態', '---|:--:|--:', 'BF-101 | a | 決定']);
    assert.deepEqual(bare?.headers, ['ID', '決まり', '状態']);
    assert.deepEqual(bare?.rows, [{ line: 3, cells: ['BF-101', 'a', '決定'] }]);

    assert.deepEqual(tablesOf(['| a | b |', '| c | d |']), [], '区切りの行が無い');
    assert.deepEqual(tablesOf(['結論', '---', '| c | d |']), [], '縦棒の無い --- は、水平線か見出しの下線');
    assert.equal(tablesOf(['| a |', '| - |']).length, 1, '見出しだけの表も表');
  });

  it('[定義: 表] 空行・見出し・コードフェンスの始まり・HTML コメントの行の手前まで続く。途中の行は、行頭が縦棒でなくても表の行', () => {
    // 行頭が縦棒でない行 (文章の行・縦棒を省いた行) も、途中なら表の行。その後ろの行も表の行
    const [table] = tablesOf([...TABLE, 'ここは文章の行', 'BF-103 | c | 決定', '| BF-130 | 隠した決まり | 確定 |']);
    assert.deepEqual(
      table?.rows.map((row) => [row.line, row.cells[0]]),
      [[3, 'BF-101'], [4, 'BF-102'], [5, 'ここは文章の行'], [6, 'BF-103'], [7, 'BF-130']],
    );
    // 表を終わらせるもの。終わった後の行は、表の行ではない
    for (const [name, terminator] of [['空行', ''], ['見出し', '## 次の節'], ['コードフェンスの始まり', '```text'], ['HTML コメント', '<!-- 注 -->']] as const) {
      const found = tablesOf([...TABLE, terminator, '| BF-130 | 隠した決まり | 確定 |']);
      assert.equal(found.length, 1, name);
      assert.equal(found[0]?.rows.length, 2, name);
    }
  });

  it('[定義: 表] コードフェンス・HTML コメント・生成区間・引用の中は表ではない。frontmatter (from より前) も見ない。セルは前後の空白を除いて切る', () => {
    const lines = [
      '---', '| a | b |', '|---|---|', '---',
      '```markdown', ...TABLE, '```',
      '<!--', ...TABLE, '-->',
      '<!-- AUTOGEN:dir-index:start — generated -->', ...TABLE, '<!-- AUTOGEN:dir-index:end -->',
      ...TABLE.map((line) => `> ${line}`),
      `> ${TABLE[0]}`, ...TABLE.slice(1), // 見出しの行だけが引用 (区切りの行からは引用でない)
      ...TABLE,
    ];
    const tables = tablesOf(lines, 4);
    assert.equal(tables.length, 1);
    assert.equal(tables[0]?.headerLine, 31);

    assert.deepEqual(splitTableRow('| BF-101 | 予約は成立させない |  決定 |'), ['BF-101', '予約は成立させない', '決定']);
    assert.deepEqual(splitTableRow('| a | | c |'), ['a', '', 'c']);
    assert.deepEqual(splitTableRow('| a \\| b | c |'), ['a \\| b', 'c']);
  });
});
