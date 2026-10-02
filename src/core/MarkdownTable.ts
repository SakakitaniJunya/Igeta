// Markdown の表 (パイプ区切り) を行番号つきで読む共通ロジック。
//
// 人の文書の「決まりの表」(PersonFormCheck・決定台帳の生成・review-sheet) が同じ読み方をするよう、ここに 1 か所だけ持つ。
// 表は、行頭が `|` の行が続くひとかたまりで、2 行目が区切りの行 (`|---|---|`) のもの。見出しの行・区切りの行を持たない
// `|` の行は表ではない。コードフェンス・HTML コメント・AUTOGEN 区間の中は、core/LineClassifier.ts の分類 (body 以外) で除く。

import type { LineKind } from './LineClassifier.js';

export interface TableRow {
  /** 1 始まりの行番号 */
  readonly line: number;
  /** パイプの間の文字列 (前後の空白を除く)。`\|` は区切りではない */
  readonly cells: readonly string[];
}

export interface MarkdownTable {
  /** 見出しの行の、1 始まりの行番号 */
  readonly headerLine: number;
  readonly headers: readonly string[];
  /** 見出しと区切りの行を除いた、データの行 */
  readonly rows: readonly TableRow[];
}

const isTableLine = (line: string): boolean => line.trim().startsWith('|');

/** 行をセルに分ける。先頭と末尾のパイプは区切りに数えない。`\|` (エスケープしたパイプ) は区切りではない */
export function splitTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

/** `|---|:--:|` のような、見出しと本体を分ける行か */
const isSeparatorRow = (line: string): boolean => splitTableRow(line).every((cell) => /^:?-+:?$/.test(cell));

/**
 * `from` 行 (0 始まり) 以降の本文 (kinds が body の行) から、表を拾う。表の途中にコードフェンスや HTML コメントが
 * 挟まれば、そこで表は終わる。
 */
export function findTables(lines: readonly string[], kinds: readonly LineKind[], from: number): readonly MarkdownTable[] {
  const tables: MarkdownTable[] = [];
  let i = from;
  while (i < lines.length) {
    if (kinds[i] !== 'body' || !isTableLine(lines[i] ?? '')) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < lines.length && kinds[i] === 'body' && isTableLine(lines[i] ?? '')) i += 1;
    if (i - start < 2 || !isSeparatorRow(lines[start + 1] ?? '')) continue;
    tables.push({
      headerLine: start + 1,
      headers: splitTableRow(lines[start] ?? ''),
      rows: lines.slice(start + 2, i).map((line, offset) => ({ line: start + 3 + offset, cells: splitTableRow(line) })),
    });
  }
  return tables;
}
