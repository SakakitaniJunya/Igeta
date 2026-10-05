// 人の文書 (docs/person/) の「決まりの表」の読み方。
// 定義の正本は、テスト仕様 03 (docs/design/test/specs/03-person-form.md) の §0。PersonFormCheck・文書のつながり (04)・
// レビューシート (05) が同じ定義を使うよう、実装はここに 1 か所だけ持つ。
//
//   ID の形      英大文字で始まる英大文字と数字の接頭辞 + `-` + 数字 3 桁 (例: BF-113)。4 桁以上・小文字・全角・
//                飾り (**BF-113**) は ID の形ではない
//   決まりの表   表 (MarkdownTable.ts) のうち、見出しの最後の列が `状態` のもの
//   決まりの行   決まりの表のデータの行で、最初のセルが ID の形だけのもの

import type { MarkdownTable } from './MarkdownTable.js';

/** 決まりの表の、最後の列の見出し */
export const STATE_COLUMN = '状態';

/** 決まりの行の最後のセルに書ける値 */
export const DECISION_STATES: readonly string[] = ['決定', '仮', '未決', '廃'];

/** 使わなくなった ID の状態。行を消さず、状態を戻さず、番号を使い直さない (ADR-0002 条件 9) */
export const STATE_ABOLISHED = '廃';

const ID_FORM = /^[A-Z][A-Z0-9]*-\d{3}$/;

/** セルが ID の形だけなら、その ID。そうでなければ null */
export function idOf(cell: string | undefined): string | null {
  return cell !== undefined && ID_FORM.test(cell) ? cell : null;
}

/** 決まりの表か (見出しの最後の列が `状態`) */
export const isDecisionTable = (table: MarkdownTable): boolean => table.headers[table.headers.length - 1] === STATE_COLUMN;

export interface DecisionRow {
  /** 1 始まりの行番号 */
  readonly line: number;
  /** 最初のセル (ID の形だけ) */
  readonly id: string;
  readonly cells: readonly string[];
  /** 最後のセルの値 */
  readonly state: string;
  /** 列の数が見出しと同じか。違えば、最後のセルが状態の列とは限らない (PersonFormCheck が違反にする) */
  readonly aligned: boolean;
}

/** 決まりの行を、決まりの表の全部から集める */
export function collectDecisionRows(tables: readonly MarkdownTable[]): readonly DecisionRow[] {
  const rows: DecisionRow[] = [];
  for (const table of tables) {
    if (!isDecisionTable(table)) continue;
    for (const row of table.rows) {
      const id = idOf(row.cells[0]);
      if (id === null) continue;
      rows.push({
        line: row.line,
        id,
        cells: row.cells,
        state: row.cells[row.cells.length - 1] ?? '',
        aligned: row.cells.length === table.headers.length,
      });
    }
  }
  return rows;
}
