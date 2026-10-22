// 決定の状態の検査と索引の公開口 (`#decision/core`)。ここでは索引の 4 つの表 (DS14) と、承認待ちの持ち主・経過 (DS11) を持つ。

import { posix } from 'node:path';
import { splitTableRow } from '../MarkdownTable.js';
import type { DecisionDoc } from './folder.js';
import { DECISIONS_DIR } from './folder.js';
import type { Finding, HistoryRow } from './history.js';

export * from './evidence.js';
export * from './fingerprint.js';
export * from './folder.js';
export * from './history.js';
export * from './ledger.js';

interface IndexSection {
  readonly mark: string;
  readonly word: string;
  readonly columns: readonly string[];
  readonly statuses: readonly string[];
}

const SECTIONS: readonly IndexSection[] = [
  { mark: '⏳', word: '承認待ち', columns: ['起案日', '持ち主', '期限'], statuses: ['proposed'] },
  { mark: '✅', word: '承認済', columns: ['承認日', '決めた人', '根拠', '覆す先'], statuses: ['accepted', 'amended'] },
  { mark: '❌', word: '却下', columns: ['却下日', '決めた人', '根拠'], statuses: ['rejected'] },
  { mark: '↪', word: '置換', columns: ['置換日', '覆した ADR'], statuses: ['superseded', 'deprecated'] },
];

const NO_VALUE = '—';
const orDash = (text: string): string => (text === '' ? NO_VALUE : text.replace(/\|/g, '\\|'));
const lastRow = (rows: readonly HistoryRow[], events: readonly string[]): HistoryRow | undefined => rows.filter((row) => events.includes(row.event)).at(-1);

function evidenceLink(evidence: string): string {
  const matched = /\/(pull|issues|commit)\/([0-9a-f]+)$/.exec(evidence);
  if (matched === null) return orDash(evidence);
  const label = matched[1] === 'commit' ? `commit ${(matched[2] ?? '').slice(0, 7)}` : `${matched[1] === 'pull' ? 'PR' : 'Issue'} #${matched[2] ?? ''}`;
  return `[${label}](${evidence})`;
}

type LinkOf = (target: DecisionDoc) => string;

function cellsOf(section: IndexSection, doc: DecisionDoc, byId: ReadonlyMap<string, DecisionDoc>, linkOf: LinkOf): string[] {
  const decided = lastRow(doc.rows, ['承認', '改訂', '却下', '移行前']);
  const referenceOf = (id: string): string => {
    const target = byId.get(id);
    return target === undefined ? orDash(id) : `[${target.number}](${linkOf(target)})`;
  };
  const date = (fallback: string): string => orDash(decided?.date ?? fallback);
  switch (section.word) {
    case '承認待ち':
      return [orDash(doc.proposed || doc.created), orDash(doc.awaiting), orDash(doc.due)];
    case '承認済':
      return [date(doc.accepted), orDash(lastRow(doc.rows, ['承認'])?.by ?? ''), evidenceLink(lastRow(doc.rows, ['承認'])?.evidence ?? ''), doc.supersedes.length > 0 ? doc.supersedes.map(referenceOf).join('・') : NO_VALUE];
    case '却下':
      return [date(''), orDash(decided?.by ?? ''), evidenceLink(decided?.evidence ?? '')];
    default:
      return [orDash(lastRow(doc.rows, ['置換', '移行前'])?.date ?? ''), doc.supersededBy === '' ? NO_VALUE : referenceOf(doc.supersededBy)];
  }
}

/** DS14: 状態ごとの 4 つの表 (0 件は `_該当なし_`)。順は番号。日付で変わる値 (経過日数) は入れない */
export function renderDecisionIndex(docs: readonly DecisionDoc[], linkOf: LinkOf): string {
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const sorted = [...docs].sort((a, b) => a.number.localeCompare(b.number));
  return SECTIONS.map((section) => {
    const members = sorted.filter((doc) => section.statuses.includes(doc.status));
    const header = ['#', 'タイトル', '状態', ...section.columns];
    const body = members.map((doc) => {
      const label = doc.status === 'amended' ? `${section.mark} ${section.word} (改訂)` : `${section.mark} ${section.word}`;
      return `| [${doc.number}](${linkOf(doc)}) | ${orDash(doc.title)} | ${label} | ${cellsOf(section, doc, byId, linkOf).join(' | ')} |`;
    });
    const table = members.length === 0 ? '_該当なし_' : [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...body].join('\n');
    return `## ${section.mark} ${section.word} (${members.length})\n\n${table}`;
  }).join('\n\n');
}

/** DS14: 索引の各表の行の印が、表の見出しの状態と合うか。lines は README 全体 */
export function checkIndexMarks(lines: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  let section: IndexSection | undefined;
  lines.forEach((line, index) => {
    const heading = /^##\s+(\S+)\s+(\S+)/.exec(line);
    if (heading !== null) section = SECTIONS.find((candidate) => candidate.word === heading[2] && candidate.mark === heading[1]);
    const state = line.startsWith('| [') ? splitTableRow(line)[2] : undefined;
    if (section === undefined || state === undefined || state.startsWith(`${section.mark} ${section.word}`)) return;
    findings.push({ rule: 'DS14', line: index + 1, message: `索引の表 "${section.mark} ${section.word}" に、状態 "${state}" の行がある (印は語の前に付き、表の状態と合う)` });
  });
  return findings;
}

/** 経過日数 = to − from (日)。どちらも `YYYY-MM-DD` */
export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export interface WaitingContext {
  /** DS12 の条件の repo か。違えば awaiting の欠けは警告にとどめる */
  readonly isStrict: boolean;
  readonly approverNames: readonly string[];
  readonly staleDays: number;
  readonly today: string;
  /** 初めて現れた日。浅い clone で辿れなければ created で、そう書く */
  readonly waitingSince: { readonly date: string; readonly isFromGit: boolean };
}

/** DS11: 持ち主 (awaiting) が要る。経過日数が staleDays を超える・期限を過ぎたら警告 (当日は超過にしない) */
export function checkWaiting(doc: DecisionDoc, context: WaitingContext): { readonly findings: Finding[]; readonly warnings: string[] } {
  if (doc.status !== 'proposed') return { findings: [], warnings: [] };
  const problems: string[] = [];
  if (doc.awaiting === '') problems.push('proposed の ADR は awaiting (持ち主) が要る');
  else if (context.approverNames.length > 0 && !context.approverNames.includes(doc.awaiting)) problems.push(`awaiting "${doc.awaiting}" が approvers の名前に無い`);
  const waited = daysBetween(context.waitingSince.date, context.today);
  const source = context.waitingSince.isFromGit ? '' : ' (初めて現れた日を辿れず、created から数えた)';
  const isOverdue = doc.due !== '' && doc.due < context.today;
  const staleNote = waited > context.staleDays || isOverdue ? [`持ち主 ${doc.awaiting || NO_VALUE}・${waited} 日待ち${source}・期限 ${doc.due || NO_VALUE}`] : [];
  const findings = context.isStrict ? problems.map((message) => ({ rule: 'DS11', line: 1, message })) : [];
  const notes = [...(context.isStrict ? [] : problems), ...staleNote];
  return { findings, warnings: notes.length === 0 ? [] : [`DS11 ADR-${doc.number}: ${notes.join('・')}`] };
}

/** 索引 README からの ADR の相対パス */
export const indexLinkOf = (doc: DecisionDoc): string => posix.relative(DECISIONS_DIR, doc.path);
