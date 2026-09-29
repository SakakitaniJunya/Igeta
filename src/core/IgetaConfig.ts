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

import { existsSync, readFileSync, statSync } from 'node:fs';
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

export interface CoverageExemption {
  readonly id: string;
  readonly reason: string;
}

export interface IgetaConfig {
  readonly sharedKinds: readonly string[];
  /** 未設定 (無制限) は null */
  readonly contextSizeLimit: number | null;
  /** source-coverage の行単位の対象外。理由は必須 (docs/explanation/05-coverage-and-learning.md §2) */
  readonly coverageExemptions: readonly CoverageExemption[];
}

export const DEFAULT_IGETA_CONFIG: IgetaConfig = {
  sharedKinds: DEFAULT_SHARED_KINDS,
  contextSizeLimit: null,
  coverageExemptions: [],
};

export type LoadIgetaConfigResult = { readonly config: IgetaConfig } | { readonly violation: Violation };

/**
 * `.igeta.json` を読む。`configPath` 省略時は `<targetRoot>/.igeta.json` (無ければ既定値。
 * 「無い」は正当な既定状態)。**`--config` で明示した場所が無ければ CannotCheck** にする
 * (省略時の既定値フォールバックと違い、明示した場所が無いのは指定間違いの可能性が高く、
 * 黙って既定値に倒すとフラグが無視されたことに気づけない。code-reviewer round 1 blocker 1)。
 * JSON が壊れている・型が違う項目があれば CannotCheck を返す。
 */
export function loadIgetaConfig(targetRoot: string, configPath?: string): LoadIgetaConfigResult {
  const path = configPath ?? join(targetRoot, '.igeta.json');
  if (!existsSync(path)) {
    if (configPath !== undefined) {
      return { violation: { severity: 'cannot-check', message: `--config で指定した場所が無い: ${path}` } };
    }
    return { config: DEFAULT_IGETA_CONFIG };
  }
  if (statSync(path).isDirectory()) {
    return { violation: { severity: 'cannot-check', message: `${path} はファイルでなくディレクトリ` } };
  }

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

  let coverageExemptions: readonly CoverageExemption[] = [];
  if ('coverageExemptions' in record) {
    const value = record['coverageExemptions'];
    if (!Array.isArray(value)) {
      return { violation: { severity: 'cannot-check', message: `${path} の coverageExemptions は配列でなければならない` } };
    }
    const exemptions: CoverageExemption[] = [];
    for (const entry of value) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        typeof (entry as Record<string, unknown>)['id'] !== 'string' ||
        (entry as Record<string, unknown>)['id'] === '' ||
        typeof (entry as Record<string, unknown>)['reason'] !== 'string' ||
        (entry as Record<string, unknown>)['reason'] === ''
      ) {
        return {
          violation: {
            severity: 'cannot-check',
            message: `${path} の coverageExemptions は { id, reason } (どちらも空でない文字列) の配列でなければならない`,
          },
        };
      }
      exemptions.push({ id: (entry as Record<string, unknown>)['id'] as string, reason: (entry as Record<string, unknown>)['reason'] as string });
    }
    coverageExemptions = exemptions;
  }

  return { config: { sharedKinds, contextSizeLimit, coverageExemptions } };
}
