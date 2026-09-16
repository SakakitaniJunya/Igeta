// 設計書の表と実装の定義を突き合わせる検査。
// 図 ↔ 実装は scripts/check-domain-diagram-drift.mjs が見るが、表 ↔ 実装は見ない。
// 表を手で書き換えたまま実装を直し忘れる (逆も) を落とすための検査。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { RESERVATION_TRANSITIONS } from '@/modules/booking/domain/reservation';
import { ERROR_CATALOG } from '@/shared/kernel/error-catalog';

const read = (relative: string): string[] =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8').split(/\r?\n/);

/** 「| a | b | c |」の行をセル配列にする。区切り行と表以外の行は捨てる。 */
function tableRows(lines: readonly string[], idPattern: RegExp): string[][] {
  return lines
    .filter((line) => line.trim().startsWith('|'))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim().replace(/`/g, '')),
    )
    .filter((cells) => idPattern.test(cells[0] ?? ''));
}

test('TST-214 状態遷移表 (設計書) と遷移定義 (実装) が一致する', () => {
  const lines = read('./docs/design/detail/state-machines/01-reservation.md');
  const rows = tableRows(lines, /^STM-1\d{2}$/);
  assert.ok(rows.length > 0, '遷移表の行 (STM-1nn) が見つからない');

  // 列: ID | 現状態 | イベント | 条件 | 次状態 | 副作用 | 発行イベント
  const documented = rows.map((cells) => {
    const event = /\(([a-z]+)\)/.exec(cells[2]);
    assert.ok(event, `イベント列に実装メソッド名がない: ${cells[0]} ${cells[2]}`);
    return `${cells[1]} --${event[1]}--> ${cells[4]}`;
  });
  const implemented = RESERVATION_TRANSITIONS.map(
    (row) => `${row.from} --${row.event}--> ${row.to}`,
  );
  assert.deepEqual([...documented].sort(), [...implemented].sort());
});

test('TST-215 メッセージ定義 (設計書) とエラーカタログ (実装) が一致する', () => {
  const lines = read('./docs/design/basic/06-messages.md');
  const rows = tableRows(lines, /^MSG-0\d{2}$/);
  assert.ok(rows.length > 0, 'メッセージ表の行 (MSG-0nn) が見つからない');

  // 列: ID | コード | HTTP | 文言 (ja) | 発生箇所
  const documented = rows.map((cells) => ({
    code: cells[1],
    statusCode: Number(cells[2]),
    message: cells[3],
  }));
  const implemented = Object.entries(ERROR_CATALOG).map(([code, definition]) => ({
    code,
    statusCode: definition.statusCode,
    message: definition.message,
  }));
  const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code);
  assert.deepEqual([...documented].sort(byCode), [...implemented].sort(byCode));
});
