// 決定台帳 (01-decisions.md) の DEC・OPEN の表の検査 (テスト仕様 10 の DS13)。
// 状態の列は 2 列目 (最後の列にしない。決まりの表と別物にする。ADR-0013 決定 8)。表の見出しに「状態」が無い台帳は対象外。

import { classifyLines } from '../LineClassifier.js';
import { findTables } from '../MarkdownTable.js';
import type { Finding } from './history.js';

export const MIGRATION_EVIDENCE = '移行前 (未記入)';
export const MIGRATION_DUE = '未定';

const MARK_OF_WORD: Readonly<Record<string, string>> = { 決定: '✅', 解決: '✅', 未決: '⏳', 暫定: '⏳', 廃: '↪' };
const WORDS_OF_KIND: Readonly<Record<string, readonly string[]>> = { DEC: ['決定', '廃'], OPEN: ['未決', '暫定', '解決'] };

export interface LedgerRow {
  readonly id: string;
  readonly line: number;
  /** 見出しの名前 → セルの値 */
  readonly cells: Readonly<Record<string, string>>;
}

export interface Ledger {
  readonly rows: readonly LedgerRow[];
  /** 状態の列を持つ DEC・OPEN の表が 1 つでもあるか */
  readonly hasStateColumn: boolean;
}

/** DEC-nnn・OPEN-nnn の行を、見出しの名前で引ける形で読む。状態の列がある表だけ */
export function readLedger(text: string): Ledger {
  const lines = text.split('\n');
  const tables = findTables(lines, classifyLines(lines), 0).filter((table) => table.headers[0] === 'ID' && table.headers.includes('状態'));
  const rows = tables.flatMap((table) =>
    table.rows
      .filter((row) => /^(DEC|OPEN)-\d{3}$/.test(row.cells[0] ?? ''))
      .map((row) => ({ id: row.cells[0] ?? '', line: row.line, cells: Object.fromEntries(table.headers.map((name, index) => [name, row.cells[index] ?? ''])) })),
  );
  return { rows, hasStateColumn: tables.length > 0 };
}

export interface LedgerContext {
  /** `YYYY-MM-DD` */
  readonly today: string;
  /** 対象 branch の台帳の行の ID。base が無ければ undefined (移行の印は全行に許し、警告として数える) */
  readonly baseIds?: ReadonlySet<string>;
  /** 根拠の相対パスが実在するか */
  readonly pathExists: (path: string) => boolean;
}

const targetsOf = (cell: string): string[] => [...[...cell.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1] ?? ''), ...(cell.match(/https?:\/\/[^\s)|]+/g) ?? [])];
const isReachable = (cell: string, pathExists: (path: string) => boolean): boolean =>
  targetsOf(cell).some((target) => /^https?:\/\//.test(target) || pathExists(target.split('#')[0] ?? ''));

function stateProblems(row: LedgerRow, kind: string): string[] {
  const [mark = '', word = ''] = (row.cells['状態'] ?? '').split(/\s+/);
  if (!(WORDS_OF_KIND[kind] ?? []).includes(word)) return [`状態 "${row.cells['状態'] ?? ''}" は ${kind} の語 (${(WORDS_OF_KIND[kind] ?? []).join('・')}) ではない`];
  return MARK_OF_WORD[word] === mark ? [] : [`状態の印 "${mark}" が語 "${word}" と合わない (${MARK_OF_WORD[word] ?? ''} ${word})`];
}

function contentProblems(row: LedgerRow, kind: string, context: LedgerContext): { problems: string[]; marks: number } {
  // 移行の印は、対象 branch に既にある行 (base が無ければ全行) にだけ許す
  const markAllowed = context.baseIds === undefined || context.baseIds.has(row.id);
  const cell = (name: string): string => row.cells[name] ?? '';
  const word = cell('状態').split(/\s+/)[1] ?? '';
  const problems: string[] = [];
  let marks = 0;
  const useMark = (text: string, mark: string, label: string): void => {
    if (text !== mark) return;
    marks += 1;
    if (!markAllowed) problems.push(`${label}の移行の印 "${mark}" は、対象 branch に既にある行にだけ書ける`);
  };
  if (kind === 'DEC' && word === '決定') {
    useMark(cell('根拠'), MIGRATION_EVIDENCE, '根拠');
    if (cell('根拠') !== MIGRATION_EVIDENCE && !isReachable(cell('根拠'), context.pathExists)) problems.push('決定の根拠が空か、URL でも実在する repo 相対パスでもない');
  }
  if (kind === 'OPEN' && (word === '未決' || word === '暫定')) {
    if (cell('持ち主') === '') problems.push('未決・暫定の行は持ち主が要る');
    useMark(cell('期限'), MIGRATION_DUE, '期限');
    if (cell('期限') !== MIGRATION_DUE && !/^\d{4}-\d{2}-\d{2}$/.test(cell('期限'))) problems.push('未決・暫定の行は期限 (YYYY-MM-DD) が要る');
  }
  if (kind === 'OPEN' && word === '解決') {
    if (!/DEC-\d{3}/.test(cell('根拠'))) problems.push('解決の根拠に DEC の ID が要る');
  }
  return { problems, marks };
}

/** DS13: 行ごとの状態・根拠・持ち主・期限・移行の印。期限切れと移行の印は警告として返す */
export function checkLedgerRows(ledger: Ledger, context: LedgerContext): { readonly findings: Finding[]; readonly warnings: string[] } {
  const findings: Finding[] = [];
  const warnings: string[] = [];
  for (const row of ledger.rows) {
    const kind = row.id.startsWith('DEC') ? 'DEC' : 'OPEN';
    const content = contentProblems(row, kind, context);
    for (const message of [...stateProblems(row, kind), ...content.problems]) findings.push({ rule: 'DS13', line: row.line, message: `${row.id}: ${message}` });
    if (content.marks > 0) warnings.push(`DS13 ${row.id}: 移行の印が残っている (値は人が直す)`);
    const due = row.cells['期限'] ?? '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(due) && due < context.today && ['未決', '暫定'].includes((row.cells['状態'] ?? '').split(/\s+/)[1] ?? '')) {
      warnings.push(`DS13 ${row.id}: 期限 ${due} を過ぎている (持ち主 ${row.cells['持ち主'] ?? ''})`);
    }
  }
  return { findings, warnings };
}

/** DS13: 行は消さない。対象 branch にあった ID が、いまの台帳に無ければ違反 */
export function checkNoRowRemoved(ledger: Ledger, baseIds: ReadonlySet<string>): Finding[] {
  const current = new Set(ledger.rows.map((row) => row.id));
  return [...baseIds].filter((id) => !current.has(id)).map((id) => ({ rule: 'DS13', line: 1, message: `${id}: 対象 branch にあった行が消えている (行は消さない。使わないなら 廃)` }));
}
