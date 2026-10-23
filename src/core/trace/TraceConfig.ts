// `.igeta.json` の `trace` の既定値と、欄・帯の宣言 ("名前:向き") の読み取り。
// 設定ファイルを開くのは core/IgetaConfig.ts だけにし、ここは trace の項目の既定値と宣言の読み方だけを持つ。

import { loadIgetaConfig } from '../IgetaConfig.js';
import type { Violation } from '../Report.js';

export const DEFAULT_TRACE_BASE = 'origin/main';

export const DEFAULT_TRACE_KINDS: readonly string[] = ['DEC', 'REQ', 'FN', 'SCR', 'API', 'TBL', 'TST'];

/** `.igeta.json` の trace に書いてあった項目。書いてない項目は undefined */
export interface TraceSettings {
  readonly kinds?: readonly string[];
  readonly code?: readonly string[];
  readonly columns?: readonly string[];
  readonly bands?: readonly string[];
  readonly strictEdges?: boolean;
  readonly tblRule?: 'warn' | 'error';
  readonly base?: string;
}

/** 既定値を足した、検査が使う設定 */
export interface TraceConfig {
  readonly kinds: readonly string[];
  /** `@trace` を要求するコードの glob。空ならコードの規則 (T7・T8・先頭行の有無) を検査しない */
  readonly code: readonly string[];
  /** 空でなければ、文書の `trace_columns` の代わりに使う ("欄の名前:up|down") */
  readonly columns: readonly string[];
  /** 空でなければ、文書の `trace_bands` の代わりに使う ("節の見出し:百の位") */
  readonly bands: readonly string[];
  readonly strictEdges: boolean;
  readonly tblRule: 'warn' | 'error';
  /** T1(b) と基準の増加を比べる先の ref。docs-check と trace が同じ値を使う */
  readonly base: string;
}

export type Direction = 'up' | 'down';

export interface BandSpec {
  readonly heading: string;
  readonly digit: number;
}

/** 設定の trace を既定値で埋める */
export function resolveTraceConfig(settings: TraceSettings): TraceConfig {
  return {
    kinds: settings.kinds ?? DEFAULT_TRACE_KINDS,
    code: settings.code ?? [],
    columns: settings.columns ?? [],
    bands: settings.bands ?? [],
    strictEdges: settings.strictEdges ?? false,
    tblRule: settings.tblRule ?? 'warn',
    base: settings.base ?? DEFAULT_TRACE_BASE,
  };
}

/** repo の `.igeta.json` から trace の設定を読む。形が不正なら CannotCheck */
export function readTraceConfig(root: string): { readonly config: TraceConfig } | { readonly violation: Violation } {
  const loaded = loadIgetaConfig(root);
  if ('violation' in loaded) return loaded;
  return { config: resolveTraceConfig(loaded.config.trace) };
}

function splitSpec(spec: string): { readonly name: string; readonly tail: string } {
  const colon = spec.lastIndexOf(':');
  return { name: colon < 1 ? '' : spec.slice(0, colon).trim(), tail: spec.slice(colon + 1).trim() };
}

/** "名前:up|down" の並びを欄の名前 → 向きの表にする。読めない宣言は invalid に返す */
export function parseColumnSpecs(specs: readonly string[]): { readonly columns: ReadonlyMap<string, Direction>; readonly invalid: readonly string[] } {
  const columns = new Map<string, Direction>();
  const invalid: string[] = [];
  for (const spec of specs) {
    const { name, tail } = splitSpec(spec);
    if (name === '' || (tail !== 'up' && tail !== 'down')) invalid.push(spec);
    else columns.set(name, tail);
  }
  return { columns, invalid };
}

/** "節の見出し:百の位" の並びを帯にする。読めない宣言 (百の位が 0〜9 の 1 桁でない) は invalid に返す */
export function parseBandSpecs(specs: readonly string[]): { readonly bands: readonly BandSpec[]; readonly invalid: readonly string[] } {
  const bands: BandSpec[] = [];
  const invalid: string[] = [];
  for (const spec of specs) {
    const { name, tail } = splitSpec(spec);
    if (name === '' || !/^\d$/.test(tail)) invalid.push(spec);
    else bands.push({ heading: name, digit: Number(tail) });
  }
  return { bands, invalid };
}
