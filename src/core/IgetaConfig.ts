// リポジトリ直下の `.igeta.json` を読む共通ロジック。項目の一覧は README の `.igeta.json` の節。
// Spec: docs/explanation/07-context-boundaries.md §4 (sharedKinds/contextSizeLimit)、
// 05-coverage-and-learning.md §2 (coverageExemptions)、08-agreement-ledger.md (reagreementRules)、
// docs/adr/0008-human-approval-scope.md (humanPaths)、docs/adr/0003-docs-model-migration-and-dogfooding.md 決定 6 (nonDocPaths)
//
// 将来足す設定もこのファイルの関数を増やさず、同じ loadIgetaConfig の戻り値に読み取りを
// 追加していく作りにする — ファイルが 1 個なのに読み取り関数が増えると「どの設定がどこに
// あるか」が散らばるため。
//
// ファイルが無ければ既定値 (サイレント縮退ではない — 「無い」は正当な既定状態)。
// ファイルはあるが形が不正なら CannotCheck にする (黙って既定値に倒さない)。

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { globCanMatchUnder, validateGlob } from '../gate/PathGlob.js';
import { ROLE_FOLDERS } from '../gate/RoleFolders.js';
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
  /**
   * 人の承認が要る追加のパス (glob、repo のルートからの相対)。足すことだけができ、外す設定は無い
   * (ADR-0008 決定 1)。既定は空。glob の書き方と当たり方は src/gate/PathGlob.ts (テスト仕様 01 の R4・R5): 大文字小文字は
   * 区別せず、フォルダ名だけを書いても (`src/core`)、その配下に当たる。
   */
  readonly humanPaths: readonly string[];
  /**
   * docs/ の置き場所の判定と docs-migrate の移動対象から外すパス (glob)。docs/person・docs/ai・
   * docs/client の配下に当たる glob は設定そのものが違反 (ADR-0003 決定 6)。既定は空。
   * 当たるかどうかの判定は humanPaths と同じ glob の意味 (src/gate/PathGlob.ts の matchesGlob)。
   */
  readonly nonDocPaths: readonly string[];
}

export const DEFAULT_IGETA_CONFIG: IgetaConfig = {
  sharedKinds: DEFAULT_SHARED_KINDS,
  contextSizeLimit: null,
  coverageExemptions: [],
  reagreementRules: DEFAULT_REAGREEMENT_RULES,
  humanPaths: [],
  nonDocPaths: [],
};

export type LoadIgetaConfigResult = { readonly config: IgetaConfig } | { readonly violation: Violation };

/**
 * glob の配列の項目 (humanPaths・nonDocPaths) を読む。配列でない・文字列でない・使えない構文
 * (validateGlob) は CannotCheck。どのパスにも当たらない glob を黙って受け入れると、人の承認の門が
 * 効かない設定が通ってしまうため、書き間違いはその場で止める。
 */
function readGlobList(
  record: Readonly<Record<string, unknown>>,
  key: 'humanPaths' | 'nonDocPaths',
  path: string,
): { readonly globs: readonly string[] } | { readonly violation: Violation } {
  const value = record[key];
  if (!Array.isArray(value) || !value.every((v): v is string => typeof v === 'string')) {
    return { violation: { severity: 'cannot-check', message: `${path} の ${key} は glob (文字列) の配列でなければならない` } };
  }
  for (const glob of value) {
    const reason = validateGlob(glob);
    if (reason !== null) {
      return { violation: { severity: 'cannot-check', message: `${path} の ${key} の ${JSON.stringify(glob)} は glob として使えない: ${reason}` } };
    }
  }
  return { globs: value };
}

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

  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { violation: { severity: 'cannot-check', message: `${path} を読めない: ${message}` } };
  }
  return parseIgetaConfig(text, path);
}

/**
 * `.igeta.json` の中身 (文字列) を読む。ファイルを開かずに、git から取り出した内容 (宛先のブランチの先端の
 * `.igeta.json` など) を読めるようにする入口。`path` はメッセージに出す名前 (ファイルのパスや `<宛先>:.igeta.json`)。
 * 項目の検査は loadIgetaConfig と同じ: JSON が壊れている・型が違う項目があれば CannotCheck、
 * nonDocPaths が 3 フォルダの配下に当たれば violation。
 */
export function parseIgetaConfig(text: string, path: string): LoadIgetaConfigResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
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

  let humanPaths: readonly string[] = [];
  if ('humanPaths' in record) {
    const read = readGlobList(record, 'humanPaths', path);
    if ('violation' in read) return read;
    humanPaths = read.globs;
  }

  let nonDocPaths: readonly string[] = [];
  if ('nonDocPaths' in record) {
    const read = readGlobList(record, 'nonDocPaths', path);
    if ('violation' in read) return read;
    nonDocPaths = read.globs;
    // 3 フォルダの配下に当たる glob は、置き場所の検査と移行の対象から人の決まりまで外してしまう。
    // 設定の形の検査はここまで。kind を書いた文書を含む glob は文書を走査する側が見る。
    const hits = nonDocPaths.flatMap((glob) => {
      const folders = ROLE_FOLDERS.filter((folder) => globCanMatchUnder(glob, folder));
      return folders.length === 0 ? [] : [`${JSON.stringify(glob)} (${folders.join('・')})`];
    });
    if (hits.length > 0) {
      return {
        violation: {
          severity: 'violation',
          message:
            `${path} の nonDocPaths が ${ROLE_FOLDERS.join('・')} の配下に当たる: ${hits.join(', ')}。` +
            'nonDocPaths で外せるのは 3 フォルダの外だけ (ADR-0003 決定 6)',
        },
      };
    }
  }

  return { config: { sharedKinds, contextSizeLimit, coverageExemptions, reagreementRules, humanPaths, nonDocPaths } };
}
