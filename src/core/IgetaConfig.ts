// リポジトリ直下の `.igeta.json` を読む共通ロジック。項目の一覧は README の `.igeta.json` の節。
// Spec: docs/explanation/07-context-boundaries.md §4 (sharedKinds/contextSizeLimit)、
// 05-coverage-and-learning.md §2 (coverageExemptions)、08-agreement-ledger.md (reagreementRules)
//
// 将来足す設定もこのファイルの関数を増やさず、同じ loadIgetaConfig の戻り値に読み取りを
// 追加していく作りにする — ファイルが 1 個なのに読み取り関数が増えると「どの設定がどこに
// あるか」が散らばるため。
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

/**
 * agreement-check の再合意判定規則。正本の変更が kind に一致 (かつ section を指定していれば
 * それも一致) したら「再合意が要る」、当たらなければ「通知のみ」にする (kind + 節単位まで、
 * 列単位は持たない。04-provenance-and-agreement.md §9)。
 */
export interface ReagreementRule {
  readonly kind: string;
  readonly section?: string;
}

/** 既定は requirements の変更を再合意対象にする (何を作るかの根拠が変わったときだけ確実に拾う)。 */
export const DEFAULT_REAGREEMENT_RULES: readonly ReagreementRule[] = [{ kind: 'requirements' }];

export interface IgetaConfig {
  readonly sharedKinds: readonly string[];
  /** 未設定 (無制限) は null */
  readonly contextSizeLimit: number | null;
  /** source-coverage の行単位の対象外。理由は必須 (docs/explanation/05-coverage-and-learning.md §2) */
  readonly coverageExemptions: readonly CoverageExemption[];
  readonly reagreementRules: readonly ReagreementRule[];
}

export const DEFAULT_IGETA_CONFIG: IgetaConfig = {
  sharedKinds: DEFAULT_SHARED_KINDS,
  contextSizeLimit: null,
  coverageExemptions: [],
  reagreementRules: DEFAULT_REAGREEMENT_RULES,
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

  let reagreementRules: readonly ReagreementRule[] = DEFAULT_REAGREEMENT_RULES;
  if ('reagreementRules' in record) {
    const value = record['reagreementRules'];
    if (!Array.isArray(value)) {
      return { violation: { severity: 'cannot-check', message: `${path} の reagreementRules は配列でなければならない` } };
    }
    const rules: ReagreementRule[] = [];
    for (const entry of value) {
      if (typeof entry !== 'object' || entry === null) {
        return { violation: { severity: 'cannot-check', message: `${path} の reagreementRules は { kind, section? } の配列でなければならない` } };
      }
      const r = entry as Record<string, unknown>;
      const kind = r['kind'];
      const section = r['section'];
      if (typeof kind !== 'string' || kind === '') {
        return { violation: { severity: 'cannot-check', message: `${path} の reagreementRules[].kind は空でない文字列でなければならない` } };
      }
      if (section !== undefined && (typeof section !== 'string' || section === '')) {
        return { violation: { severity: 'cannot-check', message: `${path} の reagreementRules[].section は空でない文字列でなければならない` } };
      }
      rules.push(typeof section === 'string' ? { kind, section } : { kind });
    }
    reagreementRules = rules;
  }

  return { config: { sharedKinds, contextSizeLimit, coverageExemptions, reagreementRules } };
}
