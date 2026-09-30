// 由来 sidecar (`<basename>.provenance.json`) の形と読み書き。
// Spec: docs/explanation/04-provenance-and-agreement.md §4
//
// normalizationVersion は設計の JSON 例ではファイル直下 1 個だが、実装ではエントリごとに持つ
// (`needs-recompute` が「このエントリを計算した版」対「今の版」の比較である以上、ファイル単位
// 1 個では一部のエントリだけ再計算したときに他のエントリの版情報が失われる。設計とのズレは
// 04-provenance-and-agreement.md に追記して報告する)。

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import type { Violation } from './Report.js';

export interface ProvenanceEntryWithSource {
  readonly anchor: string;
  readonly from: string;
  readonly fingerprint: string;
  readonly capturedBy: string;
  readonly capturedAt: string;
  readonly acceptedBy?: string;
  readonly acceptedAt?: string;
  readonly normalizationVersion: number;
}

export interface ProvenanceEntryNoSource {
  readonly anchor: string;
  readonly from: null;
  readonly reason: string;
  readonly blockFingerprint: string;
  readonly capturedBy: string;
  readonly capturedAt: string;
  readonly acceptedBy?: string;
  readonly acceptedAt?: string;
  readonly normalizationVersion: number;
}

export type ProvenanceEntry = ProvenanceEntryWithSource | ProvenanceEntryNoSource;

export interface ProvenanceSidecar {
  readonly sourceDoc: string;
  readonly entries: readonly ProvenanceEntry[];
}

/** 章の絶対パスから sidecar の絶対パスを作る (同じディレクトリ、拡張子だけ `.provenance.json`)。 */
export function sidecarPathFor(chapterAbsPath: string): string {
  const ext = extname(chapterAbsPath);
  const stem = basename(chapterAbsPath, ext);
  return join(dirname(chapterAbsPath), `${stem}.provenance.json`);
}

export type ReadSidecarResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'ok'; readonly sidecar: ProvenanceSidecar }
  | { readonly kind: 'invalid'; readonly violation: Violation };

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value !== '';

function validateEntry(raw: unknown, sidecarPath: string, index: number): ProvenanceEntry | string {
  if (typeof raw !== 'object' || raw === null) return `entries[${index}] がオブジェクトでない`;
  const r = raw as Record<string, unknown>;
  if (!isNonEmptyString(r['anchor'])) return `entries[${index}].anchor が無い`;
  if (!isNonEmptyString(r['capturedBy'])) return `entries[${index}].capturedBy が無い`;
  if (!isNonEmptyString(r['capturedAt'])) return `entries[${index}].capturedAt が無い`;
  if (typeof r['normalizationVersion'] !== 'number') return `entries[${index}].normalizationVersion が無い`;
  const acceptedBy = r['acceptedBy'];
  const acceptedAt = r['acceptedAt'];
  if (acceptedBy !== undefined && !isNonEmptyString(acceptedBy)) return `entries[${index}].acceptedBy の形が不正`;
  if (acceptedAt !== undefined && !isNonEmptyString(acceptedAt)) return `entries[${index}].acceptedAt の形が不正`;

  const base = {
    anchor: r['anchor'] as string,
    capturedBy: r['capturedBy'] as string,
    capturedAt: r['capturedAt'] as string,
    normalizationVersion: r['normalizationVersion'] as number,
    ...(isNonEmptyString(acceptedBy) ? { acceptedBy } : {}),
    ...(isNonEmptyString(acceptedAt) ? { acceptedAt } : {}),
  };

  if (r['from'] === null) {
    if (!isNonEmptyString(r['reason'])) return `entries[${index}] (from: null) に reason が無い`;
    if (!isNonEmptyString(r['blockFingerprint'])) return `entries[${index}] (from: null) に blockFingerprint が無い`;
    return { ...base, from: null, reason: r['reason'], blockFingerprint: r['blockFingerprint'] };
  }
  if (!isNonEmptyString(r['from'])) return `entries[${index}].from は文字列か null でなければならない`;
  if (!isNonEmptyString(r['fingerprint'])) return `entries[${index}] に fingerprint が無い`;
  return { ...base, from: r['from'], fingerprint: r['fingerprint'] };
}

/** sidecar が無いのは正当な状態 (absent)。JSON が壊れている・形が不正なら invalid。 */
export function readSidecar(chapterAbsPath: string): ReadSidecarResult {
  const path = sidecarPathFor(chapterAbsPath);
  if (!existsSync(path)) return { kind: 'absent' };

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: 'invalid', violation: { severity: 'cannot-check', message: `${path} の JSON が壊れている: ${message}` } };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { kind: 'invalid', violation: { severity: 'cannot-check', message: `${path} はオブジェクトでなければならない` } };
  }
  const record = raw as Record<string, unknown>;
  if (!isNonEmptyString(record['sourceDoc'])) {
    return { kind: 'invalid', violation: { severity: 'cannot-check', message: `${path} に sourceDoc が無い` } };
  }
  const entriesRaw = record['entries'];
  if (!Array.isArray(entriesRaw)) {
    return { kind: 'invalid', violation: { severity: 'cannot-check', message: `${path} の entries が配列でない` } };
  }
  const entries: ProvenanceEntry[] = [];
  for (let i = 0; i < entriesRaw.length; i += 1) {
    const result = validateEntry(entriesRaw[i], path, i);
    if (typeof result === 'string') {
      return { kind: 'invalid', violation: { severity: 'cannot-check', message: `${path}: ${result}` } };
    }
    entries.push(result);
  }
  return { kind: 'ok', sidecar: { sourceDoc: record['sourceDoc'], entries } };
}

export function writeSidecar(chapterAbsPath: string, sidecar: ProvenanceSidecar): void {
  writeFileSync(sidecarPathFor(chapterAbsPath), `${JSON.stringify(sidecar, null, 2)}\n`);
}
