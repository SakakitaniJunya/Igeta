// Markdown の表 (パイプ区切り) を行番号つきで読む共通ロジック。
// 定義の正本は、テスト仕様 03 (docs/design/test/specs/03-person-form.md) §0 の「表」:
//   次の行が区切りの行 (`---` の並び) である見出しの行から始まり、空行・見出し・コードフェンスの始まり・HTML コメントの行の
//   手前まで続く行の並び。コードフェンス・生成区間・HTML コメントの外 (core/LineClassifier.ts の分類で body の行だけ)。
//   見出しと区切りの行頭の縦棒は無くてもよい。表の途中の行は、行頭が縦棒でなくても表の行として読む (Markdown の描画と
//   同じ。表の直後に文章を書くときは空行を挟む)。引用 (`>`) の中の表は読まない。
// PersonFormCheck・決定台帳の生成区間・review-sheet が、同じ読み方をするよう、ここに 1 か所だけ持つ。

import type { LineKind } from './LineClassifier.js';

export interface TableRow {
  /** 1 始まりの行番号 */
  readonly line: number;
  /** パイプの間の文字列 (前後の空白を除く)。`\|` は区切りではない。行頭が縦棒でない行は、行全体が 1 つのセル */
  readonly cells: readonly string[];
}

export interface MarkdownTable {
  /** 見出しの行の、1 始まりの行番号 */
  readonly headerLine: number;
  readonly headers: readonly string[];
  /** 見出しと区切りの行を除いた、データの行 */
  readonly rows: readonly TableRow[];
}

/** 見出し (`#`)。表の途中に現れたら、表はそこで終わる */
const HEADING = /^\s{0,3}#{1,6}(\s|$)/;
/** 引用 (`>`)。引用の中の表は読まない */
const QUOTE = /^\s{0,3}>/;

const isBlank = (line: string): boolean => line.trim() === '';

/** 行をセルに分ける。先頭と末尾のパイプは (あれば) 区切りに数えない。`\|` (エスケープしたパイプ) は区切りではない */
export function splitTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

/**
 * `|---|:--:|` のような、見出しと本体を分ける行か。縦棒が 1 つも無い `---` は、表の区切りではなく、水平線か
 * 見出しの下線 (Markdown でもそう読む)。
 */
const isSeparatorRow = (line: string): boolean => line.includes('|') && splitTableRow(line).every((cell) => /^:?-+:?$/.test(cell));

/**
 * `from` 行 (0 始まり) 以降の本文 (kinds が body の行) から、表を拾う。表の途中にコードフェンス・HTML コメント・生成区間の
 * 行が挟まれば、そこで表は終わる。
 */
export function findTables(lines: readonly string[], kinds: readonly LineKind[], from: number): readonly MarkdownTable[] {
  const tables: MarkdownTable[] = [];
  let i = from;
  while (i < lines.length) {
    const header = lines[i] ?? '';
    const separator = lines[i + 1] ?? '';
    if (
      kinds[i] !== 'body' ||
      kinds[i + 1] !== 'body' ||
      isBlank(header) ||
      HEADING.test(header) ||
      QUOTE.test(header) ||
      !isSeparatorRow(separator)
    ) {
      i += 1;
      continue;
    }
    let end = i + 2;
    while (end < lines.length && kinds[end] === 'body' && !isBlank(lines[end] ?? '') && !HEADING.test(lines[end] ?? '')) end += 1;
    tables.push({
      headerLine: i + 1,
      headers: splitTableRow(header),
      rows: lines.slice(i + 2, end).map((line, offset) => ({ line: i + 3 + offset, cells: splitTableRow(line) })),
    });
    i = end;
  }
  return tables;
}
