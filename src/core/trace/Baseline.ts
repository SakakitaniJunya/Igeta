// 基準ファイル (`.igeta-trace-baseline.json`)。違反だけの指紋 (規則・ID・ファイル) を持ち、減る方向にしか動かさない。

import type { Finding } from './model/Types.js';

export const BASELINE_FILE = '.igeta-trace-baseline.json';

/** 指摘の指紋。行番号は入れない (行が動いても同じ違反として扱う) */
export const fingerprint = (finding: Finding): string => `${finding.rule}|${finding.id}|${finding.path}`;

/** 基準の中身を読む。形が違えば error */
export function parseBaseline(text: string): { readonly fingerprints: readonly string[] } | { readonly error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { error: `JSON が壊れている: ${error instanceof Error ? error.message : String(error)}` };
  }
  const list = typeof raw === 'object' && raw !== null ? (raw as { fingerprints?: unknown }).fingerprints : undefined;
  if (!Array.isArray(list) || !list.every((item): item is string => typeof item === 'string')) {
    return { error: '{ "fingerprints": [文字列, ...] } の形でなければならない' };
  }
  return { fingerprints: list };
}

/** 基準ファイルの本文。並べ替えて重複を除き、差分が読める形にする */
export function formatBaseline(fingerprints: readonly string[]): string {
  return `${JSON.stringify({ version: 1, fingerprints: [...new Set(fingerprints)].sort() }, null, 2)}\n`;
}

/** 基準に有る違反を baselined に分ける。警告は基準の対象外で、そのまま fresh に残る */
export function applyBaseline(findings: readonly Finding[], base: readonly string[]): { fresh: Finding[]; baselined: Finding[] } {
  const known = new Set(base);
  const isBaselined = (finding: Finding): boolean => finding.level === 'violation' && known.has(fingerprint(finding));
  return { fresh: findings.filter((finding) => !isBaselined(finding)), baselined: findings.filter(isBaselined) };
}

/** 現在の基準に、origin の基準に無い指紋があるか。あれば基準が増えている */
export function grew(current: readonly string[], origin: readonly string[]): boolean {
  const known = new Set(origin);
  return current.some((item) => !known.has(item));
}

/** 基準から、もう出ていない指紋を除く。新しい指紋は足さない */
export function shrinkBaseline(base: readonly string[], findings: readonly Finding[]): string[] {
  const live = new Set(findings.filter((finding) => finding.level === 'violation').map(fingerprint));
  return base.filter((item) => live.has(item));
}
