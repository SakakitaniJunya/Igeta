// 指紋の載せ替えの判断 (ADR-0007 決定 2、ADR-0006 決定 6 (b))。ファイルには触らない。
//
// 載せ替えるのは「保存値の版で、今の本文 = 承認したときの本文と機械で確かめられたもの」だけ。
// 載せ替え後の値は、その同じ本文から今の版で計算する。人が承認した事実は書き換えず、指紋の計算方法だけを付け替える。
// 確かめられないもの (保存値の版の実装が無い) を、版番号が合うから一致とみなす代用は作らない。

import type { DestinationRewriter } from './Fingerprint.js';
import { CURRENT_NORMALIZATION_VERSION, computeFingerprint, matchStoredFingerprint, normalizeForFingerprint } from './Fingerprint.js';
import type { ProvenanceEntry } from './ProvenanceSidecar.js';

/** sidecar の `rebasedBy`・台帳の `rebasedBy`/`movedBy` に書く、機械の操作であることを示す名前 (承認の記録ではない)。 */
export const IGETA_ACTOR = 'igeta';

/**
 * 載せ替えなかった理由。
 * - mismatch: 保存値の版で今の本文を計算した値が保存値と違う (既に変わっている。stale のまま人の確認に回す)
 * - unverifiable: 保存値の版の実装が無く、確かめられない
 * - not-state-column: 元の行が保存値と一致するが、新しい行は「元の行 + 状態の列」ではない
 */
export type KeptReason = 'mismatch' | 'unverifiable' | 'not-state-column';

/** rebased の fingerprint は、同じ本文から今の版で計算した値。 */
export type RebaseDecision =
  | { readonly kind: 'rebased'; readonly fingerprint: string }
  | { readonly kind: 'kept'; readonly reason: KeptReason };

/** 載せ替えの対象 1 つ。本文と、その本文がある文書でのリンクの解決を持つ。 */
export interface RebaseTarget {
  readonly stored: string;
  /** 保存値を計算した版 */
  readonly storedVersion: number;
  readonly text: string;
  readonly rewrite: DestinationRewriter;
}

/** 通常の載せ替え: 保存値の版で今の本文を計算して保存値と一致したものだけ、同じ本文から今の版で計算し直す。 */
export function decideRebase(target: RebaseTarget): RebaseDecision {
  const match = matchStoredFingerprint(target.stored, target.storedVersion, target.text, target.rewrite);
  if (match !== 'match') return { kind: 'kept', reason: match };
  return { kind: 'rebased', fingerprint: computeFingerprint(target.text, CURRENT_NORMALIZATION_VERSION, target.rewrite) };
}

/** 状態の列だけを足した行の載せ替え (ADR-0006 決定 6 (b))。表の行の指紋だけが対象。 */
export interface StateColumnTarget {
  readonly stored: string;
  readonly storedVersion: number;
  /** 列を足す前の行 (元の行) と、その文書でのリンクの解決 */
  readonly oldRow: string;
  readonly oldRewrite: DestinationRewriter;
  /** 列を足した後の行 (今の正本の行) と、その文書でのリンクの解決 */
  readonly newRow: string;
  readonly newRewrite: DestinationRewriter;
}

/** `| a | b |` を、前後の空白を除いたセルの並びにする (v2 の表の行の正規化と同じ、`|` だけの区切り)。表の行でなければ null。 */
function tableCells(normalizedRow: string): string[] | null {
  if (normalizedRow.length < 2 || !normalizedRow.startsWith('|') || !normalizedRow.endsWith('|')) return null;
  return normalizedRow
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * 載せ替えるのは次の 2 つがそろったときだけ。
 * 1. 元の行を保存値の版で計算した値が保存値と一致する
 * 2. 新しい行から最後の列 (状態の列) を除いた行が、元の行と一致する (保存値の版の正規化で比べる。列幅などの整形は無視)
 * 載せ替え後の値は、新しい行 (状態の列を含む) から今の版で計算する。他の文字も変えた行は 2 で落ちる。
 * 最後の列が状態の列かどうかは、行だけからは分からない (表の見出しは見ない)。足したのが状態の列であることは、
 * 呼び出し側 (docs-migrate) が保証する。
 */
export function decideStateColumnRebase(target: StateColumnTarget): RebaseDecision {
  const match = matchStoredFingerprint(target.stored, target.storedVersion, target.oldRow, target.oldRewrite);
  if (match !== 'match') return { kind: 'kept', reason: match };

  const oldCells = tableCells(normalizeForFingerprint(target.oldRow, target.storedVersion, target.oldRewrite));
  const newCells = tableCells(normalizeForFingerprint(target.newRow, target.storedVersion, target.newRewrite));
  const onlyStateColumnAdded =
    oldCells !== null && newCells !== null && newCells.length === oldCells.length + 1 && oldCells.every((cell, i) => cell === newCells[i]);
  if (!onlyStateColumnAdded) return { kind: 'kept', reason: 'not-state-column' };
  return { kind: 'rebased', fingerprint: computeFingerprint(target.newRow, CURRENT_NORMALIZATION_VERSION, target.newRewrite) };
}

const TRACE_KEYS: ReadonlySet<string> = new Set(['rebasedFrom', 'rebasedAt', 'rebasedBy']);

/**
 * sidecar のエントリを載せ替えた形にする。指紋と版を付け替え、rebasedFrom (載せ替え前の値)・rebasedAt・
 * rebasedBy を足す。承認 (acceptedBy/acceptedAt)・capturedBy/capturedAt は保つ。
 * 項目の並びは変えず、載せ替えの記録は指紋のすぐ後ろに置く: 差分には指紋・版・載せ替えの記録だけが出て、
 * 承認の行には触れない (人が差分で、承認が変わっていないことを確かめられる)。前の載せ替えの記録があれば置き換える。
 */
export function rebasedEntry(entry: ProvenanceEntry, fingerprint: string, rebasedAt: string): ProvenanceEntry {
  const fingerprintKey = entry.from === null ? 'blockFingerprint' : 'fingerprint';
  const trace = { rebasedFrom: entry.from === null ? entry.blockFingerprint : entry.fingerprint, rebasedAt, rebasedBy: IGETA_ACTOR };
  const current = entry as unknown as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(current)) {
    if (TRACE_KEYS.has(key)) continue;
    if (key === fingerprintKey) {
      next[key] = fingerprint;
      Object.assign(next, trace);
    } else {
      next[key] = key === 'normalizationVersion' ? CURRENT_NORMALIZATION_VERSION : current[key];
    }
  }
  return next as unknown as ProvenanceEntry;
}

/** 結果の 1 件 (載せ替えた・触らなかった・付け替えた)。file は repo 相対パス、target は anchor や台帳の対象。 */
export interface ChangeItem {
  readonly file: string;
  readonly target: string;
  readonly detail: string;
}

/** 触らなかった理由を、人が読む文にする。version は保存値の版。 */
export function describeKept(reason: KeptReason, version: number): string {
  switch (reason) {
    case 'mismatch':
      return `版 ${version} で計算した今の本文が保存値と違う (本文が変わったか、載せ替える前にリンクを書き換えた。載せ替えない。人の確認に回す)`;
    case 'unverifiable':
      return `版 ${version} の実装が無く確かめられない (載せ替えない)`;
    case 'not-state-column':
      return '新しい行が「元の行 + 状態の列」ではない (載せ替えない)';
  }
}
