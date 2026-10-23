// docs-migrate の決定の段 (MG3): 決定台帳 (01-decisions.md) の DEC・OPEN の表に、状態・根拠・持ち主・期限の列を足す。
//   DEC  → 状態 `✅ 決定`、根拠 `移行前 (未記入)`
//   OPEN → 状態 `⏳ 未決` (暫定値の列が埋まっていれば `⏳ 暫定`)、持ち主 = approvers の先頭の名前、期限 `未定`、根拠 `移行前 (未記入)`
// 値は移行の PR で人が直す。直るまで DS13 は警告として数え、違反にしない。元の列は、順を変えても値を落とさない。

import { MIGRATION_DUE, MIGRATION_EVIDENCE } from '#decision/core';
import { classifyLines } from '../core/LineClassifier.js';
import { findTables } from '../core/MarkdownTable.js';
import type { MarkdownTable } from '../core/MarkdownTable.js';

const DEC_COLUMNS = ['ID', '状態', '日付', '決めた人', '原文', '根拠', '決定', '影響する文書'];
const OPEN_COLUMNS = ['ID', '状態', '論点', '推奨案', '暫定値', '持ち主', '期限', '根拠', '影響する文書'];
const RENAMED: Readonly<Record<string, string>> = { 仮置き値: '暫定値' };

type Kind = 'DEC' | 'OPEN';

function kindOf(table: MarkdownTable): Kind | undefined {
  if (table.headers[0] !== 'ID' || table.headers.includes('状態')) return undefined;
  const prefixes = new Set(table.rows.map((row) => /^(DEC|OPEN)-\d{3}$/.exec(row.cells[0] ?? '')?.[1]));
  return prefixes.size === 1 && prefixes.has('DEC') ? 'DEC' : prefixes.size === 1 && prefixes.has('OPEN') ? 'OPEN' : undefined;
}

const cellsLine = (cells: readonly string[]): string => `| ${cells.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`;

function rewriteTable(table: MarkdownTable, kind: Kind, owner: string): string[] {
  const fixed = kind === 'DEC' ? DEC_COLUMNS : OPEN_COLUMNS;
  const oldNames = table.headers.map((name) => RENAMED[name] ?? name);
  const headers = [...fixed, ...oldNames.filter((name) => !fixed.includes(name))];
  const body = table.rows.map((row) => {
    const old = new Map(oldNames.map((name, index) => [name, row.cells[index] ?? ''] as const));
    const added: Record<string, string> =
      kind === 'DEC'
        ? { 状態: '✅ 決定', 根拠: MIGRATION_EVIDENCE }
        : { 状態: (old.get('暫定値') ?? '') === '' ? '⏳ 未決' : '⏳ 暫定', 持ち主: owner, 期限: MIGRATION_DUE, 根拠: MIGRATION_EVIDENCE };
    // 旧い表に既にある列 (根拠・持ち主・期限など) の値は残し、空か無い列だけ移行の仮値にする
    return cellsLine(headers.map((name) => ((old.get(name) ?? '') !== '' ? (old.get(name) ?? '') : (added[name] ?? ''))));
  });
  return [cellsLine(headers), `|${headers.map(() => '---').join('|')}|`, ...body];
}

/** 台帳の本文を移行する。直す表が無ければ同じ本文を返す */
export function migrateLedgerText(text: string, owner: string): string {
  const lines = text.split('\n');
  const tables = findTables(lines, classifyLines(lines), 0);
  let result = lines;
  for (const table of [...tables].reverse()) {
    const kind = kindOf(table);
    if (kind === undefined) continue;
    const last = table.rows.at(-1)?.line ?? table.headerLine;
    result = [...result.slice(0, table.headerLine - 1), ...rewriteTable(table, kind, owner), ...result.slice(last)];
  }
  return result.join('\n');
}
