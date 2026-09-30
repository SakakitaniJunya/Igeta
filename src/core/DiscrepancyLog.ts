// 食い違いの記録 (`discrepancies.log.jsonl`) の形と読み書き。追記のみ。
// Spec: docs/explanation/05-coverage-and-learning.md §3
//
// 置き場所は「提出物のディレクトリ」直下。案件の情報は案件の repo にだけ置き、
// Igeta 本体へは汎化した規則だけを昇格させる (category だけを機械が読む)。

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Violation } from './Report.js';

export const DISCREPANCY_FILENAME = 'discrepancies.log.jsonl';

/**
 * category はコード内の閉集合で管理する (設計 05 §4 の初期一覧)。
 * 自由記述にすると綴り違いが別 category として静かに集計され、§5 の事前捕捉率が割れるため、
 * 書く側 (discrepancy-add) は集合外を違反にし、読む側は集合外の行を壊れた行として扱う。
 */
export const DISCREPANCY_CATEGORIES = [
  'scope-overstatement',
  'open-stated-as-final',
  'missing-confirmation-item',
  'stale-copy-across-sources',
  'mermaid-unrenderable',
] as const;

export type DiscrepancyCategory = (typeof DISCREPANCY_CATEGORIES)[number];

export function isDiscrepancyCategory(value: string): value is DiscrepancyCategory {
  return (DISCREPANCY_CATEGORIES as readonly string[]).includes(value);
}

export interface DiscrepancyEntry {
  /** 記録した日 (UTC の ISO 日付部分。agreement-approve の approvedAt と同じ型) */
  readonly date: string;
  /** `<repo 相対パス>[#<anchor>]` */
  readonly location: string;
  /** 食い違いの元になった正本側の ID (修飾形式 `<doc-id>/PREFIX-nnn`)。無ければ null */
  readonly sourceId: string | null;
  readonly category: DiscrepancyCategory;
  /** 事前に捕まえた検査名 (`provenance-check` 等)。評価者が後から見つけた場合は null */
  readonly caughtBy: string | null;
  /** 直した commit。未確定なら null */
  readonly fixedInCommit: string | null;
}

export function discrepancyLogPathFor(submissionDir: string): string {
  return join(submissionDir, DISCREPANCY_FILENAME);
}

export type ReadDiscrepancyLogResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'ok'; readonly entries: readonly DiscrepancyEntry[] }
  | { readonly kind: 'invalid'; readonly violation: Violation };

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value !== '';
/** null/省略/文字列を string | null にそろえる。それ以外の型は壊れた行。 */
const nullableString = (value: unknown): string | null | undefined =>
  value === null || value === undefined ? null : typeof value === 'string' ? value : undefined;

function validateEntry(record: Record<string, unknown>, path: string, lineNo: number): DiscrepancyEntry | string {
  if (!isNonEmptyString(record['date'])) return `${path}:${lineNo} date が無い`;
  if (!isNonEmptyString(record['location'])) return `${path}:${lineNo} location が無い`;
  const category = record['category'];
  if (!isNonEmptyString(category)) return `${path}:${lineNo} category が無い`;
  if (!isDiscrepancyCategory(category)) {
    return `${path}:${lineNo} category が一覧に無い: ${category} (有効値: ${DISCREPANCY_CATEGORIES.join(', ')})`;
  }
  const sourceId = nullableString(record['sourceId']);
  if (sourceId === undefined) return `${path}:${lineNo} sourceId は文字列か null でなければならない`;
  const caughtBy = nullableString(record['caughtBy']);
  if (caughtBy === undefined) return `${path}:${lineNo} caughtBy は文字列か null でなければならない`;
  const fixedInCommit = nullableString(record['fixedInCommit']);
  if (fixedInCommit === undefined) return `${path}:${lineNo} fixedInCommit は文字列か null でなければならない`;
  return {
    date: record['date'],
    location: record['location'],
    sourceId,
    category,
    caughtBy,
    fixedInCommit,
  };
}

/** ログが無いのは正当な状態 (absent)。壊れた行が 1 つでもあれば invalid (黙って読み飛ばさない)。 */
export function readDiscrepancyLog(submissionDir: string): ReadDiscrepancyLogResult {
  const path = discrepancyLogPathFor(submissionDir);
  if (!existsSync(path)) return { kind: 'absent' };

  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '');
  const entries: DiscrepancyEntry[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    let raw: unknown;
    try {
      raw = JSON.parse(lines[i] ?? '');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { kind: 'invalid', violation: { severity: 'cannot-check', message: `${path}:${lineNo} JSON が壊れている: ${message}` } };
    }
    if (typeof raw !== 'object' || raw === null) {
      return { kind: 'invalid', violation: { severity: 'cannot-check', message: `${path}:${lineNo} オブジェクトでない` } };
    }
    const result = validateEntry(raw as Record<string, unknown>, path, lineNo);
    if (typeof result === 'string') return { kind: 'invalid', violation: { severity: 'cannot-check', message: result } };
    entries.push(result);
  }
  return { kind: 'ok', entries };
}

/**
 * 追記のみ。既存行は書き換えない。
 * 末尾が改行で終わっていないログには追記しない (前の行と繋がって両方が壊れるため)。
 * 追記できたら null、できなければ理由を返す。
 */
export function appendDiscrepancyLogEntry(submissionDir: string, entry: DiscrepancyEntry): Violation | null {
  const path = discrepancyLogPathFor(submissionDir);
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8');
    if (current !== '' && !current.endsWith('\n')) {
      return { severity: 'cannot-check', message: `${path} の末尾が改行で終わっていない (前の追記が途中で切れた疑い。追記しない)` };
    }
  }
  appendFileSync(path, `${JSON.stringify(entry)}\n`);
  return null;
}
