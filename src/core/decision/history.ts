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
    evidence: cells[4] ?? '',
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

function serializeRow(row: NewHistoryRow): string {
  const escape = (text: string): string => (text === '' ? EMPTY_CELL : text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' '));
  const cells = [row.date, row.event, `${row.before}→${row.after}`, row.by, row.evidence, row.commit, row.fingerprint, row.memo];
  return `| ${cells.map(escape).join(' | ')} |`;
}

/** 履歴の末尾に 1 行足した本文を返す。節が無ければ、本文の末尾に節ごと足す */
export function appendHistoryRow(text: string, row: NewHistoryRow): string {
  const lines = text.split('\n');
  const section = parseHistory(lines);
  if (section.startIndex === -1) {
    const header = `| ${HISTORY_COLUMNS.join(' | ')} |`;
    const separator = `|${HISTORY_COLUMNS.map(() => '---').join('|')}|`;
    return `${text.replace(/\n*$/, '\n')}\n${HISTORY_HEADING}\n\n${header}\n${separator}\n${serializeRow(row)}\n`;
  }
  lines.splice(section.lastTableIndex + 1, 0, serializeRow(row));
  return lines.join('\n');
}

/** 事象ごとの、前→後として許す状態。移行前は前が不明なので after だけを見る */
const EVENT_RULES: Readonly<Record<string, { readonly from: readonly string[]; readonly to: readonly string[] }>> = {
  承認: { from: ['proposed'], to: ['accepted'] },
  却下: { from: ['proposed'], to: ['rejected'] },
  改訂: { from: ['accepted', 'amended'], to: ['amended'] },
  置換: { from: ['accepted', 'amended'], to: ['superseded'] },
  差戻し: { from: ['accepted', 'rejected'], to: ['proposed'] },
  移行前: { from: [], to: ['superseded', 'deprecated'] },
};

export const isPreMigrationRow = (row: HistoryRow): boolean => row.event === '移行前';

function checkRowTransition(row: HistoryRow, previousAfter: string | undefined): Finding[] {
  const rule = EVENT_RULES[row.event];
  if (rule === undefined) return [{ rule: 'DS9', line: row.line, message: `履歴の事象 "${row.event}" は使えない (${Object.keys(EVENT_RULES).join('・')})` }];
  const findings: Finding[] = [];
  const isPreMigration = isPreMigrationRow(row);
  if (!rule.to.includes(row.after) || (!isPreMigration && !rule.from.includes(row.before))) {
    findings.push({ rule: 'DS9', line: row.line, message: `${row.before}→${row.after} は事象 "${row.event}" で許される遷移ではない` });
  }
  if (previousAfter !== undefined && !isPreMigration && row.before !== previousAfter) {
    findings.push({ rule: 'DS9', line: row.line, message: `前の状態 ${row.before} が、一つ前の行の後 ${previousAfter} と続いていない` });
  }
  if (row.event === '差戻し' && row.memo === '') findings.push({ rule: 'DS9', line: row.line, message: '差戻しの行は、メモに旧い状態と日付が要る' });
  if (row.after === 'deprecated' && !isPreMigration) findings.push({ rule: 'DS9', line: row.line, message: 'deprecated にする書き込み口は無い (移行前の行だけが持てる)' });
  return findings;
}

/** DS9: 行ごとの遷移と、行の連なり */
export function checkTransitions(rows: readonly HistoryRow[]): Finding[] {
  return rows.flatMap((row, index) => checkRowTransition(row, rows[index - 1]?.after));
}

/** DS3: status は履歴の最後の「後」と同じ。行が 0 本なら proposed。proposed 以外は 1 本以上 */
export function checkStatusMatchesHistory(status: string, rows: readonly HistoryRow[]): Finding[] {
  const last = rows.at(-1);
  if (last === undefined) {
    return status === 'proposed' ? [] : [{ rule: 'DS3', line: 1, message: `status: ${status} だが承認の履歴の行が無い (手書きの状態。decision-* で記録する)` }];
  }
  return last.after === status ? [] : [{ rule: 'DS3', line: 1, message: `status: ${status} が履歴の最後の「後」(${last.after}) と違う` }];
}

const sameRow = (a: HistoryRow, b: HistoryRow): boolean => serializeRow(a) === serializeRow(b);

/** DS7: 対象 branch の履歴に対して、1 行も消えず・変わらず・順が同じで、新しい行は末尾だけ */
export function checkAppendOnly(base: { readonly status: string; readonly rows: readonly HistoryRow[] }, current: { readonly status: string; readonly rows: readonly HistoryRow[] }): Finding[] {
  const changed = base.rows.findIndex((baseRow, index) => {
    const row = current.rows[index];
    return row === undefined || !sameRow(baseRow, row);
  });
  if (changed !== -1) {
    return [{ rule: 'DS7', line: current.rows[changed]?.line ?? 1, message: `履歴の ${changed + 1} 行目が対象 branch から変わった・消えた (履歴は追記のみ)` }];
  }
  if (base.status !== current.status && current.rows.length === base.rows.length) {
    return [{ rule: 'DS7', line: 1, message: `status が ${base.status} から ${current.status} に変わったのに、履歴の行が増えていない` }];
  }
  return [];
}
