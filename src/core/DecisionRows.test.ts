// node --test dist/core/DecisionRows.test.js
// テスト仕様 03 (docs/design/test/specs/03-person-form.md) §0 の定義の表: ID の形・決まりの表・決まりの行。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { collectDecisionRows, idOf, isDecisionTable } from './DecisionRows.js';
import { classifyLines } from './LineClassifier.js';
import { findTables } from './MarkdownTable.js';

const tablesOf = (lines: readonly string[]): ReturnType<typeof findTables> => findTables(lines, classifyLines(lines), 0);

describe('定義の表 (テスト仕様 03 §0)', () => {
  it('[定義: ID の形] 英大文字で始まる英大文字と数字の接頭辞 + `-` + 数字 3 桁。4 桁以上・小文字・全角・飾り・後ろに続く文字は ID の形ではない', () => {
    for (const cell of ['BF-113', 'I18N-001', 'B-001', 'REQ-999']) assert.equal(idOf(cell), cell, cell);
    const notIds = ['BF-1130', 'BF-13', 'bf-113', 'ＢＦ-113', '**BF-113**', '`BF-113`', 'BF-113 (案)', ' BF-113', '参照 BF-113', '1F-113', '-113', 'ID', '', undefined];
    for (const cell of notIds) assert.equal(idOf(cell), null, String(cell));
  });

  it('[定義: 決まりの表] 見出しの最後の列が `状態` の表。コードフェンス・生成区間・HTML コメントの外の表だけを見る', () => {
    const lines = [
      '| ID | 決まり | 状態 |', '|---|---|---|', '| BF-101 | a | 決定 |',
      '',
      '| ID | 状態 | 決まり |', '|---|---|---|', '| BF-201 | 決定 | b |',
      '',
      '| 問い | 対象 ID | 選択肢 | 決まらないと止まること |', '|---|---|---|---|', '| q | BF-101 | x | y |',
      '',
      '```markdown', '| ID | 状態 |', '|---|---|', '| BF-301 | 決定 |', '```',
      '<!-- AUTOGEN:dir-index:start — generated -->', '| ID | 状態 |', '|---|---|', '| BF-401 | 決定 |', '<!-- AUTOGEN:dir-index:end -->',
    ];
    assert.deepEqual(tablesOf(lines).map(isDecisionTable), [true, false, false]);
  });

  it('[定義: 決まりの行] 決まりの表のデータの行で、最初のセルが ID の形だけのもの。列の数が見出しと違う行は、そう分かるように返す', () => {
    const lines = [
      '| ID | 決まり | 状態 |', '|---|---|---|',
      '| BF-101 | a | 決定 |',
      '| **BF-102** | b | 仮 |',
      '| BF-103 (案) | c | 仮 |',
      '| BF-104 | 列が足りない |',
      '| 注記 | d | 未決 |',
      '',
      '| ID | 内容 |', '|---|---|', '| BF-201 | 決まりの表ではない |',
    ];
    assert.deepEqual(collectDecisionRows(tablesOf(lines)), [
      { line: 3, id: 'BF-101', cells: ['BF-101', 'a', '決定'], state: '決定', aligned: true },
      { line: 6, id: 'BF-104', cells: ['BF-104', '列が足りない'], state: '列が足りない', aligned: false },
    ]);
  });
});
