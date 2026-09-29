// リポジトリ直下の `.igeta.json` を読む共通ロジック。
// Spec: docs/explanation/07-context-boundaries.md §4
//
// 今回使うのは sharedKinds (context-boundary-check の対象外 kind) と contextSizeLimit
// (context-size の上限) だけ。将来足す設定 (由来・合意の再合意規則等) はこのファイルの
// 関数を増やさず、同じ loadIgetaConfig の戻り値に読み取りを追加していく作りにする —
// ファイルが 1 個なのに読み取り関数が増えると「どの設定がどこにあるか」が散らばるため。
//
// ファイルが無ければ既定値 (サイレント縮退ではない — 「無い」は正当な既定状態)。
// ファイルはあるが形が不正なら CannotCheck にする (黙って既定値に倒さない)。

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Violation } from './Report.js';

export const DEFAULT_SHARED_KINDS: readonly string[] = [
  'glossary',
  'adr',
  'map',
  'decision-log',
  'document-taxonomy',
  'explanation',
  'guide',
  'runbook',
];

export interface IgetaConfig {
  readonly sharedKinds: readonly string[];
  /** 未設定 (無制限) は null */
  readonly contextSizeLimit: number | null;
}

export const DEFAULT_IGETA_CONFIG: IgetaConfig = {
  sharedKinds: DEFAULT_SHARED_KINDS,
  contextSizeLimit: null,
};

export type LoadIgetaConfigResult = { readonly config: IgetaConfig } | { readonly violation: Violation };

/**
 * `.igeta.json` を読む。`configPath` 省略時は `<targetRoot>/.igeta.json`。
 * ファイルが無ければ既定値。JSON が壊れている・型が違う項目があれば CannotCheck を返す。
 */
export function loadIgetaConfig(targetRoot: string, configPath?: string): LoadIgetaConfigResult {
  const path = configPath ?? join(targetRoot, '.igeta.json');
  if (!existsSync(path)) return { config: DEFAULT_IGETA_CONFIG };

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { violation: { severity: 'cannot-check', message: `${path} の JSON が壊れている: ${message}` } };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { violation: { severity: 'cannot-check', message: `${path} はオブジェクトでなければならない` } };
  }
  const record = raw as Record<string, unknown>;

  let sharedKinds: readonly string[] = DEFAULT_SHARED_KINDS;
  if ('sharedKinds' in record) {
    const value = record['sharedKinds'];
    if (!Array.isArray(value) || !value.every((v): v is string => typeof v === 'string')) {
      return { violation: { severity: 'cannot-check', message: `${path} の sharedKinds は文字列の配列でなければならない` } };
    }
    sharedKinds = value;
  }

  let contextSizeLimit: number | null = null;
  if ('contextSizeLimit' in record) {
    const value = record['contextSizeLimit'];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return { violation: { severity: 'cannot-check', message: `${path} の contextSizeLimit は正の数でなければならない` } };
    }
    contextSizeLimit = value;
  }

  return { config: { sharedKinds, contextSizeLimit } };
}
