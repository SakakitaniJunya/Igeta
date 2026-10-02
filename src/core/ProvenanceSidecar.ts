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

/**
 * `igeta fingerprint-rebase` が載せ替えたエントリに付く記録 (ADR-0007 決定 2)。
 * 載せ替えは指紋の計算方法を付け替えるだけで、承認 (acceptedBy/acceptedAt) は書き換えない。
 */
export interface RebaseTrace {
  /** 載せ替える前の指紋 (保存値の版で計算したもの) */
  readonly rebasedFrom?: string;
  readonly rebasedAt?: string;
  readonly rebasedBy?: string;
}

export interface ProvenanceEntryWithSource extends RebaseTrace {
  readonly anchor: string;
  readonly from: string;
  readonly fingerprint: string;
  readonly capturedBy: string;
  readonly capturedAt: string;
  readonly acceptedBy?: string;
  readonly acceptedAt?: string;
  readonly normalizationVersion: number;
}

export interface ProvenanceEntryNoSource extends RebaseTrace {
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

/** 指紋を今の本文から計算し直したエントリは、載せ替えた記録 (rebasedFrom/At/By) を引き継がない (記録が実態と食い違うため)。 */
export function withoutRebaseTrace<E extends RebaseTrace>(entry: E): Omit<E, keyof RebaseTrace> {
  const { rebasedFrom: _from, rebasedAt: _at, rebasedBy: _by, ...rest } = entry;
  return rest;
}

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

function validateEntryFields(raw: unknown, sidecarPath: string, index: number): ProvenanceEntry | string {
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
  const rebasedFrom = r['rebasedFrom'];
  const rebasedAt = r['rebasedAt'];
  const rebasedBy = r['rebasedBy'];
  if (rebasedFrom !== undefined && !isNonEmptyString(rebasedFrom)) return `entries[${index}].rebasedFrom の形が不正`;
  if (rebasedAt !== undefined && !isNonEmptyString(rebasedAt)) return `entries[${index}].rebasedAt の形が不正`;
  if (rebasedBy !== undefined && !isNonEmptyString(rebasedBy)) return `entries[${index}].rebasedBy の形が不正`;

  const base = {
    anchor: r['anchor'] as string,
    capturedBy: r['capturedBy'] as string,
    capturedAt: r['capturedAt'] as string,
    normalizationVersion: r['normalizationVersion'] as number,
    ...(isNonEmptyString(acceptedBy) ? { acceptedBy } : {}),
    ...(isNonEmptyString(acceptedAt) ? { acceptedAt } : {}),
    ...(isNonEmptyString(rebasedFrom) ? { rebasedFrom } : {}),
    ...(isNonEmptyString(rebasedAt) ? { rebasedAt } : {}),
    ...(isNonEmptyString(rebasedBy) ? { rebasedBy } : {}),
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

/**
 * 検査した項目を、ファイルにあった順で返す (知らない項目は落とす)。読んで書き戻したとき、触らない項目の行が動かないので、
 * 載せ替え・付け替えの差分には変えた項目だけが出る。人が差分で、承認 (acceptedBy / acceptedAt) が変わっていないことを確かめられる。
 */
function inFileOrder(entry: ProvenanceEntry, raw: Record<string, unknown>): ProvenanceEntry {
  const checked = entry as unknown as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) if (key in checked) ordered[key] = checked[key];
  return ordered as unknown as ProvenanceEntry;
}

function validateEntry(raw: unknown, sidecarPath: string, index: number): ProvenanceEntry | string {
  const entry = validateEntryFields(raw, sidecarPath, index);
  return typeof entry === 'string' ? entry : inFileOrder(entry, raw as Record<string, unknown>);
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
