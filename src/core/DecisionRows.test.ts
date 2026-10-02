// node --test dist/core/DecisionRows.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { collectStateRows, DECISION_STATES, isStateTable, leadingId, PENDING_STATES } from './DecisionRows.js';
import { classifyLines } from './LineClassifier.js';
import { findTables } from './MarkdownTable.js';

const tablesOf = (lines: readonly string[]): ReturnType<typeof findTables> => findTables(lines, classifyLines(lines), 0);

describe('leadingId', () => {
  it('セルの先頭の PREFIX-nnn を取る。数字を含む接頭辞 (I18N) も読む。後ろに文字が続いても、先頭の ID だけ', () => {
    assert.equal(leadingId('BF-113'), 'BF-113');
    assert.equal(leadingId('I18N-001'), 'I18N-001');
    assert.equal(leadingId('BF-113 (旧 BF-013)'), 'BF-113');
  });

  it('ID でないセル (小文字・桁が違う・先頭に別の文字・空・無し) は null', () => {
    for (const cell of ['bf-113', 'BF-13', 'BF-1130', '**BF-113**', '参照 BF-113', '', 'ID', undefined]) {
      assert.equal(leadingId(cell), null, String(cell));
    }
  });
});

describe('状態の語彙', () => {
  it('状態は 決定・仮・未決・廃 の 4 つ。人の決めを待つのは 仮 と 未決', () => {
    assert.deepEqual(DECISION_STATES, ['決定', '仮', '未決', '廃']);
    assert.deepEqual(PENDING_STATES, ['仮', '未決']);
  });
});

describe('collectStateRows', () => {
  const lines = [
    '| ID | 決まり | 状態 |',
    '|---|---|---|',
    '| BF-101 | a | 決定 |',
    '| BF-102 | b | 仮 |',
    '| 注記 | c | 未決 |',
    '| BF-103 | 列が足りない |',
    '',
    '| ID | 状態 | 決まり |',
    '|---|---|---|',
    '| BF-201 | 決定 | d |',
  ];

  it('最後の見出しが「状態」の表だけから、行頭の ID・最後の列の値・行番号つきで集める', () => {
    const tables = tablesOf(lines);
    assert.deepEqual(tables.map(isStateTable), [true, false]);
    assert.deepEqual(collectStateRows(tables), [
      { line: 3, id: 'BF-101', cells: ['BF-101', 'a', '決定'], state: '決定' },
      { line: 4, id: 'BF-102', cells: ['BF-102', 'b', '仮'], state: '仮' },
      { line: 5, id: null, cells: ['注記', 'c', '未決'], state: '未決' },
    ]);
  });

  it('列数が見出しと違う行は、最後のセルが状態の列かどうか分からないので集めない', () => {
    assert.ok(!collectStateRows(tablesOf(lines)).some((row) => row.cells[0] === 'BF-103'));
  });
});
