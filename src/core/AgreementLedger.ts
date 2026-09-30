// 顧客との合意台帳 (`agreements.ledger.jsonl`) の形と読み書き。追記のみ。
// Spec: docs/explanation/08-agreement-ledger.md
//
// 置き場所は「提出物のディレクトリ」(章・sidecar と同じディレクトリ) 直下。事前に manifest から
// 一意に決められない (manifest 自身は 1 段浅いことが多い設計) ため、呼び出し側が決めて渡す。

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Violation } from './Report.js';

export const LEDGER_FILENAME = 'agreements.ledger.jsonl';

export interface AgreementExportChapter {
  /** 提出物のディレクトリからの相対パス */
  readonly file: string;
  /** その時点の章本文 (frontmatter/AUTOGEN/omitSections 除去済み、PDF に出る本文) の指紋 */
  readonly chapterFingerprint: string;
  readonly sources: readonly { readonly from: string; readonly fingerprint: string }[];
}

export interface AgreementExportEvent {
  readonly event: 'export';
  readonly version: string;
  readonly date: string;
  /** 提出物のディレクトリから見た manifest の相対パス (参考情報) */
  readonly manifest: string;
  /** 記録時点の omitSections。agreement-check が章本文を再計算するときに同じ除去を再現する */
  readonly omitSections: readonly string[];
  readonly chapters: readonly AgreementExportChapter[];
}

export interface AgreementApproveEvent {
  readonly event: 'approve';
  readonly targetVersion: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly note?: string;
}

export type AgreementEvent = AgreementExportEvent | AgreementApproveEvent;

export function ledgerPathFor(submissionDir: string): string {
  return join(submissionDir, LEDGER_FILENAME);
}

export type ReadLedgerResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'ok'; readonly events: readonly AgreementEvent[] }
  | { readonly kind: 'invalid'; readonly violation: Violation };

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');

function validateExportEvent(record: Record<string, unknown>, path: string, lineNo: number): AgreementExportEvent | string {
  if (!isNonEmptyString(record['version'])) return `${path}:${lineNo} export に version が無い`;
  if (!isNonEmptyString(record['date'])) return `${path}:${lineNo} export に date が無い`;
  if (!isNonEmptyString(record['manifest'])) return `${path}:${lineNo} export に manifest が無い`;
  if (!isStringArray(record['omitSections'])) return `${path}:${lineNo} export の omitSections が配列でない`;
  const chaptersRaw = record['chapters'];
  if (!Array.isArray(chaptersRaw)) return `${path}:${lineNo} export の chapters が配列でない`;
  const chapters: AgreementExportChapter[] = [];
  for (const raw of chaptersRaw) {
    if (typeof raw !== 'object' || raw === null) return `${path}:${lineNo} export の chapters の要素がオブジェクトでない`;
    const c = raw as Record<string, unknown>;
    if (!isNonEmptyString(c['file'])) return `${path}:${lineNo} export の chapters[].file が無い`;
    if (!isNonEmptyString(c['chapterFingerprint'])) return `${path}:${lineNo} export の chapters[].chapterFingerprint が無い`;
    const sourcesRaw = c['sources'];
    if (!Array.isArray(sourcesRaw)) return `${path}:${lineNo} export の chapters[].sources が配列でない`;
    const sources: { from: string; fingerprint: string }[] = [];
    for (const s of sourcesRaw) {
      if (typeof s !== 'object' || s === null) return `${path}:${lineNo} export の sources の要素がオブジェクトでない`;
      const sr = s as Record<string, unknown>;
      if (!isNonEmptyString(sr['from']) || !isNonEmptyString(sr['fingerprint'])) {
        return `${path}:${lineNo} export の sources[] は from/fingerprint が必須`;
      }
      sources.push({ from: sr['from'], fingerprint: sr['fingerprint'] });
    }
    chapters.push({ file: c['file'], chapterFingerprint: c['chapterFingerprint'], sources });
  }
  return {
    event: 'export',
    version: record['version'] as string,
    date: record['date'] as string,
    manifest: record['manifest'] as string,
    omitSections: record['omitSections'] as string[],
    chapters,
  };
}

function validateApproveEvent(record: Record<string, unknown>, path: string, lineNo: number): AgreementApproveEvent | string {
  if (!isNonEmptyString(record['targetVersion'])) return `${path}:${lineNo} approve に targetVersion が無い`;
  if (!isNonEmptyString(record['approvedBy'])) return `${path}:${lineNo} approve に approvedBy が無い`;
  if (!isNonEmptyString(record['approvedAt'])) return `${path}:${lineNo} approve に approvedAt が無い`;
  const note = record['note'];
  if (note !== undefined && typeof note !== 'string') return `${path}:${lineNo} approve の note は文字列でなければならない`;
  return {
    event: 'approve',
    targetVersion: record['targetVersion'] as string,
    approvedBy: record['approvedBy'] as string,
    approvedAt: record['approvedAt'] as string,
    ...(typeof note === 'string' ? { note } : {}),
  };
}

/** ledger が無いのは正当な状態 (absent)。壊れた行が 1 つでもあれば invalid (黙って読み飛ばさない)。 */
export function readLedger(submissionDir: string): ReadLedgerResult {
  const path = ledgerPathFor(submissionDir);
  if (!existsSync(path)) return { kind: 'absent' };

  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '');
  const events: AgreementEvent[] = [];
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
    const record = raw as Record<string, unknown>;
    if (record['event'] === 'export') {
      const result = validateExportEvent(record, path, lineNo);
      if (typeof result === 'string') return { kind: 'invalid', violation: { severity: 'cannot-check', message: result } };
      events.push(result);
    } else if (record['event'] === 'approve') {
      const result = validateApproveEvent(record, path, lineNo);
      if (typeof result === 'string') return { kind: 'invalid', violation: { severity: 'cannot-check', message: result } };
      events.push(result);
    } else {
      return { kind: 'invalid', violation: { severity: 'cannot-check', message: `${path}:${lineNo} event が export/approve のどちらでもない` } };
    }
  }
  return { kind: 'ok', events };
}

/**
 * 追記のみ。既存行は書き換えない。
 * 末尾が改行で終わっていない台帳には追記しない (前の行と繋がって両方が壊れるため)。
 * 追記できたら null、できなければ理由を返す。
 */
export function appendLedgerEvent(submissionDir: string, event: AgreementEvent): Violation | null {
  const path = ledgerPathFor(submissionDir);
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8');
    if (current !== '' && !current.endsWith('\n')) {
      return { severity: 'cannot-check', message: `${path} の末尾が改行で終わっていない (前の追記が途中で切れた疑い。追記しない)` };
    }
  }
  appendFileSync(path, `${JSON.stringify(event)}\n`);
  return null;
}
