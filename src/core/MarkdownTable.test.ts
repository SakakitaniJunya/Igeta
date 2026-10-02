// node --test dist/core/MarkdownTable.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyLines } from './LineClassifier.js';
import { findTables, splitTableRow } from './MarkdownTable.js';

const tablesOf = (lines: readonly string[], from = 0): ReturnType<typeof findTables> => findTables(lines, classifyLines(lines), from);

describe('splitTableRow', () => {
  it('先頭と末尾のパイプを区切りに数えず、セルの前後の空白を除く', () => {
    assert.deepEqual(splitTableRow('| BF-101 | 予約は成立させない |  決定 |'), ['BF-101', '予約は成立させない', '決定']);
    assert.deepEqual(splitTableRow('  |a|b|  '), ['a', 'b']);
  });

  it('空のセルは空の文字列で残る。パイプで終わらない行も読める', () => {
    assert.deepEqual(splitTableRow('| a | | c |'), ['a', '', 'c']);
    assert.deepEqual(splitTableRow('| a | b'), ['a', 'b']);
  });

  it('エスケープしたパイプ (\\|) は区切りではない', () => {
    assert.deepEqual(splitTableRow('| a \\| b | c |'), ['a \\| b', 'c']);
    assert.deepEqual(splitTableRow('| a | b \\|'), ['a', 'b \\|']);
  });
});

describe('findTables', () => {
  const TABLE = ['| ID | 決まり | 状態 |', '|---|---|---|', '| BF-101 | a | 決定 |', '| BF-102 | b | 仮 |'];

  it('見出し・区切り・データの行を、1 始まりの行番号つきで読む。区切りの行はデータに入れない', () => {
    const [table] = tablesOf(['# 題名', '', ...TABLE, '', '本文']);
    assert.equal(table?.headerLine, 3);
    assert.deepEqual(table?.headers, ['ID', '決まり', '状態']);
    assert.deepEqual(table?.rows, [
      { line: 5, cells: ['BF-101', 'a', '決定'] },
      { line: 6, cells: ['BF-102', 'b', '仮'] },
    ]);
  });

  it('空行で分かれた複数の表を、別々に読む。揃えの指定 (:--・--:) の区切りの行も読める', () => {
    const tables = tablesOf([...TABLE, '', '| 用語 | 意味 |', '|:--|--:|', '| 予約 | 席 |']);
    assert.equal(tables.length, 2);
    assert.deepEqual(tables[1]?.headers, ['用語', '意味']);
    assert.equal(tables[1]?.headerLine, 6);
    assert.equal(tables[1]?.rows.length, 1);
  });

  it('区切りの行が無い `|` の行は、表ではない。見出しだけの表 (データの行が 0) は表', () => {
    assert.deepEqual(tablesOf(['| a | b |', '| c | d |']), []);
    assert.deepEqual(tablesOf(['| a |']), []);
    const [empty] = tablesOf(['| a | b |', '|---|---|']);
    assert.deepEqual(empty?.rows, []);
  });

  it('コードフェンス・HTML コメント・AUTOGEN 区間の中の表は拾わない', () => {
    const lines = [
      '```markdown',
      ...TABLE,
      '```',
      '<!--',
      ...TABLE,
      '-->',
      '<!-- AUTOGEN:dir-index:start — generated -->',
      ...TABLE,
      '<!-- AUTOGEN:dir-index:end -->',
      ...TABLE,
    ];
    const tables = tablesOf(lines);
    assert.equal(tables.length, 1);
    assert.equal(tables[0]?.headerLine, 19);
  });

  it('from (frontmatter の次の行) より前の表は拾わない', () => {
    const lines = ['---', '| a | b |', '|---|---|', '| c | d |', '---', ...TABLE];
    const tables = tablesOf(lines, 5);
    assert.equal(tables.length, 1);
    assert.equal(tables[0]?.headerLine, 6);
  });

  it('表の途中にコードフェンスが挟まれば、そこで表は終わる', () => {
    const tables = tablesOf(['| a | b |', '|---|---|', '| 1 | 2 |', '```', '| 3 | 4 |', '```']);
    assert.equal(tables.length, 1);
    assert.equal(tables[0]?.rows.length, 1);
  });
});
