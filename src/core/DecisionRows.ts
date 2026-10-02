// 人の文書 (docs/person/) の「決まりの表」の読み方。
// Spec: docs/adr/0002-role-boundary-invariants.md の条件 5・9・11、docs/explanation/09-reader-granularity.md §3。
//
// 決まりの表は、最後の列の見出しが「状態」の表。行頭が ID (PREFIX-nnn) の行が、決まりの 1 行で、最後の列の値が
// 決定・仮・未決・廃のどれか。PersonFormCheck (型の検査)・決定台帳の生成区間 (仮と未決を 1 か所に集める)・
// review-sheet (変わった行だけを並べる) が、同じ読み方をするよう、ここに 1 か所だけ持つ。

import type { MarkdownTable, TableRow } from './MarkdownTable.js';

/** 決まりの表の、最後の列の見出し */
export const STATE_COLUMN = '状態';

export const STATE_DECIDED = '決定';
/** AI が置いた値で、人の承認待ち */
export const STATE_TENTATIVE = '仮';
export const STATE_OPEN = '未決';
/** 使わなくなった ID。行を消さず、状態を戻さず、番号を使い直さない (ADR-0002 条件 9) */
export const STATE_ABOLISHED = '廃';

export const DECISION_STATES: readonly string[] = [STATE_DECIDED, STATE_TENTATIVE, STATE_OPEN, STATE_ABOLISHED];

/** 人の決めを待つ状態。決定台帳が 1 か所に集める (ADR-0002 条件 11) */
export const PENDING_STATES: readonly string[] = [STATE_TENTATIVE, STATE_OPEN];

/** セルの先頭の ID (PREFIX-nnn)。後ろに文字が続いても、先頭の ID だけを取る。4 桁以上の数字は ID ではない */
const LEADING_ID_RE = /^([A-Z][A-Z0-9]*-\d{3})(?!\d)/;

/** セルの先頭にある ID。無ければ null */
export function leadingId(cell: string | undefined): string | null {
  return LEADING_ID_RE.exec(cell ?? '')?.[1] ?? null;
}

/** 最後の列の見出しが「状態」の表か */
export const isStateTable = (table: MarkdownTable): boolean => table.headers[table.headers.length - 1] === STATE_COLUMN;

export interface StateRow {
  /** 1 始まりの行番号 */
  readonly line: number;
  /** 行頭の ID。ID で始まらない行は null */
  readonly id: string | null;
  readonly cells: readonly string[];
  /** 最後の列の値 */
  readonly state: string;
}

/**
 * 決まりの表 (最後の列が「状態」の表) の行を集める。列数が見出しと違う行は、最後のセルが状態の列かどうか分からない
 * ので集めない (型の検査が、行頭が自分の ID の行について、列数の食い違いを違反にする)。
 */
export function collectStateRows(tables: readonly MarkdownTable[]): readonly StateRow[] {
  const rows: StateRow[] = [];
  for (const table of tables) {
    if (!isStateTable(table)) continue;
    for (const row of table.rows) {
      if (row.cells.length !== table.headers.length) continue;
      rows.push(toStateRow(row));
    }
  }
  return rows;
}

function toStateRow(row: TableRow): StateRow {
  return { line: row.line, id: leadingId(row.cells[0]), cells: row.cells, state: row.cells[row.cells.length - 1] ?? '' };
}
