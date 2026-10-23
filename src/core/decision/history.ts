// 決定の「承認の履歴」(ADR 本文の追記表) の読み書きと、状態の遷移の規則 (テスト仕様 10 の DS3・DS7・DS9)。
// 履歴は status の根拠で、書くのは decision-* の書き込み口だけ。ここは表の形と、行の並びが許されるかだけを見る。

import { splitTableRow } from '../MarkdownTable.js';

/** 検査の結果の取り出し口。null や undefined を返さず、失敗の理由を持たせる (FN-15) */
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

export const succeed = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (reason: string): Result<never> => ({ ok: false, reason });

/** 規則 ID 付きの指摘。line は 1 始まり。path は、複数の ADR を見る規則だけが入れる (1 本の規則は呼び出し側が持つ) */
export interface Finding {
  readonly rule: string;
  readonly line: number;
  readonly message: string;
  readonly path?: string;
}

export interface HistoryRow {
  readonly line: number;
  readonly date: string;
  readonly event: string;
  readonly before: string;
  readonly after: string;
  readonly by: string;
  readonly evidence: string;
  readonly commit: string;
  readonly fingerprint: string;
  readonly memo: string;
}

export const HISTORY_HEADING = '## 承認の履歴';
const HISTORY_COLUMNS = ['日付', '事象', '前→後', '決めた人', '根拠', '根拠 commit', '本文指紋', 'メモ'];
const EMPTY_CELL = '—';

/** 履歴の節の位置 (0 始まりの行番号)。節が無ければ startIndex は -1 */
export interface HistorySection {
  readonly rows: readonly HistoryRow[];
  readonly startIndex: number;
  readonly endIndex: number;
  readonly lastTableIndex: number;
}

const cellValue = (cell: string): string => (cell === EMPTY_CELL ? '' : cell.replace(/\\\|/g, '|'));
/** 根拠の URL は `<…>` で囲んで書く (markdownlint の MD034 を通すため)。読むときは外す */
const unwrapUrl = (cell: string): string => /^<https?:\/\/[^>\s]+>$/.test(cell) ? cell.slice(1, -1) : cell;

function toRow(line: string, lineNumber: number): HistoryRow {
  const cells = splitTableRow(line).map(cellValue);
  const [before = '', after = ''] = (cells[2] ?? '').split('→').map((part) => part.trim());
  return {
    line: lineNumber,
    date: cells[0] ?? '',
    event: cells[1] ?? '',
    before,
    after,
    by: cells[3] ?? '',
    evidence: unwrapUrl(cells[4] ?? ''),
    commit: cells[5] ?? '',
    fingerprint: cells[6] ?? '',
    memo: cells[7] ?? '',
  };
}

/** `## 承認の履歴` の節の表を読む。節は次の `## ` 見出しか末尾まで */
export function parseHistory(lines: readonly string[]): HistorySection {
  const startIndex = lines.findIndex((line) => line.trim() === HISTORY_HEADING);
  if (startIndex === -1) return { rows: [], startIndex, endIndex: lines.length, lastTableIndex: -1 };
  const next = lines.findIndex((line, index) => index > startIndex && /^##\s/.test(line));
  const endIndex = next === -1 ? lines.length : next;
  const tableLines = lines.map((line, index) => ({ line, index })).filter(({ line, index }) => index > startIndex && index < endIndex && line.trim().startsWith('|'));
  const rows = tableLines.slice(2).map(({ line, index }) => toRow(line, index + 1));
  return { rows, startIndex, endIndex, lastTableIndex: tableLines.at(-1)?.index ?? -1 };
}

export type NewHistoryRow = Omit<HistoryRow, 'line'>;

export function serializeRow(row: NewHistoryRow): string {
  const escape = (text: string): string => (text === '' ? EMPTY_CELL : text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' '));
  const evidence = /^https?:\/\/\S+$/.test(row.evidence) ? `<${row.evidence}>` : row.evidence;
  const cells = [row.date, row.event, `${row.before}→${row.after}`, row.by, evidence, row.commit, row.fingerprint, row.memo];
  return `| ${cells.map(escape).join(' | ')} |`;
}

/** 履歴の末尾に 1 行足した本文を返す。節が無ければ、本文の末尾に節ごと足す */
export function appendHistoryRow(text: string, row: NewHistoryRow): string {
  const header = `| ${HISTORY_COLUMNS.join(' | ')} |`;
  const separator = `|${HISTORY_COLUMNS.map(() => '---').join('|')}|`;
  const lines = text.split('\n');
  const section = parseHistory(lines);
  if (section.startIndex === -1) return `${text.replace(/\n*$/, '\n')}\n${HISTORY_HEADING}\n\n${header}\n${separator}\n${serializeRow(row)}\n`;
  if (section.lastTableIndex === -1) {
    // 見出しはあるが表が無い: 見出しの直後に表を作る (frontmatter の前に入れない)
    const isFollowedByBlank = (lines[section.startIndex + 1] ?? '').trim() === '';
    lines.splice(section.startIndex + 1, 0, '', header, separator, serializeRow(row), ...(isFollowedByBlank ? [] : ['']));
    return lines.join('\n');
  }
  lines.splice(section.lastTableIndex + 1, 0, serializeRow(row));
  return lines.join('\n');
}

export const isPreMigrationRow = (row: HistoryRow): boolean => row.event === '移行前';
