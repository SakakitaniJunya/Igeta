// docs-migrate の行き先の決め方 (テスト仕様 07 の M4〜M6)。行き先は要件定義書 02 §7 の表 (src/core/Role.ts の PLACEMENTS) から
// kind と context と年で決める。推定はしない。決まらないものは止める (S5・S2)。
// 戻り値のパスは docs/ からの相対パス (区切りは `/`)。

import { placementOf } from '../core/Role.js';
import { SHARED_CONTEXT } from '../core/Context.js';

/**
 * 型が名前を固定する文書の名前 (M4)。雛形 (templates/docs/**) のファイル名と突き合わせる (DocsMigrateTargets.test.ts)。
 * 雛形に無い kind (ai/specs/shared の secrets-management・external-integration) は名前を変えない (表に無い)。
 */
export const FIXED_NAMES: ReadonlyMap<string, string> = new Map([
  ['map', '00-map.md'],
  ['function-list', '01-function-list.md'],
  ['solution-strategy', '02-solution-strategy.md'],
  ['nonfunctional', '03-nonfunctional.md'],
  ['permission-matrix', '04-permission-matrix.md'],
  ['data-management', '05-data-management.md'],
  ['as-is-overview', '06-as-is-overview.md'],
  ['risks-tech-debt', '07-risks-tech-debt.md'],
  ['operations', '08-operations.md'],
  ['migration-plan', '09-migration-plan.md'],
  ['glossary', '10-glossary.md'],
  ['decision-log', '01-decisions.md'],
  ['crosscutting', '01-crosscutting.md'],
  ['code-definitions', '02-code-definitions.md'],
  ['messages', '03-messages.md'],
  ['i18n', '04-i18n.md'],
  ['infra-design', '05-infra-design.md'],
  ['test-plan', '08-test-plan.md'],
  ['domain-overview', '09-domain-overview.md'],
  ['aggregate-map', '10-aggregate-map.md'],
  ['implementation-order', '02-implementation-order.md'],
  ['context-contract', 'contract.md'],
]);

/** person/design/shared の固定番号の文書 (まとまりがあれば person/design/<c>/ の NN-<kind>.md にも置ける) */
const PERSON_SHARED_FIXED: ReadonlySet<string> = new Set([
  'function-list',
  'solution-strategy',
  'nonfunctional',
  'permission-matrix',
  'data-management',
  'as-is-overview',
  'risks-tech-debt',
  'operations',
  'migration-plan',
]);

/** ai/specs/<c>/<dir>/ に置く kind */
const AI_PER_CONTEXT: ReadonlyMap<string, string> = new Map([
  ['api-spec', 'api'],
  ['table-spec', 'tables'],
  ['domain-model', 'domain'],
  ['sequence-spec', 'sequences'],
  ['state-machine', 'state-machines'],
  ['module-spec', 'modules'],
  ['job', 'jobs'],
  ['test-spec', 'tests'],
]);

/** ai/specs/shared に置く kind (固定番号の文書を含む) */
const AI_SHARED: ReadonlySet<string> = new Set([
  'crosscutting',
  'code-definitions',
  'messages',
  'i18n',
  'infra-design',
  'secrets-management',
  'external-integration',
  'test-plan',
  'domain-overview',
  'aggregate-map',
]);

/** person/design/<c>/<dir>/ に置く kind */
const PERSON_PER_CONTEXT: ReadonlyMap<string, string> = new Map([
  ['business-flow', 'flows'],
  ['screen-spec', 'screens'],
  ['feature-brief', 'features'],
]);

/** 年のフォルダに置く kind の、年を読む frontmatter の項目 (順に見る) */
const YEAR_KEYS: readonly string[] = ['created', 'proposed', 'adopted', 'accepted'];

export const yearOf = (values: (key: string) => string | undefined): string | null => {
  for (const key of YEAR_KEYS) {
    const value = values(key);
    const matched = value === undefined ? null : /^(\d{4})-\d{2}-\d{2}/.exec(value);
    if (matched !== null && matched[1] !== undefined) return matched[1];
  }
  return null;
};

/** まとまりの名前として使えるか。パスの 1 階層になる値だけ */
export const isValidContextName = (name: string): boolean =>
  name !== '' && !name.includes('/') && !name.includes('\\') && !name.startsWith('.') && !/\s/.test(name);

export interface TargetInput {
  readonly kind: string;
  /** 元のファイル名 (basename)。名前を固定しない文書はこれをそのまま使う */
  readonly name: string;
  /** frontmatter の context (無記入なら null) */
  readonly context: string | null;
  /** 年のフォルダに置く kind の年 (無ければ null) */
  readonly year: string | null;
}

/**
 * context を使う kind で、context が無かったことを一覧で知らせるかどうか (M5)。
 * 返した context は、そのまま行き先のフォルダ名に使う (無ければ shared)。
 */
export type TargetOutcome =
  | { readonly kind: 'ok'; readonly path: string; readonly contextDefaulted: boolean }
  | { readonly kind: 'stop'; readonly code: 'S2' | 'S5'; readonly reason: string };

const ok = (path: string, contextDefaulted = false): TargetOutcome => ({ kind: 'ok', path, contextDefaulted });
const stop = (code: 'S2' | 'S5', reason: string): TargetOutcome => ({ kind: 'stop', code, reason });

/** kind と context と年から、docs/ からの行き先を決める。handbook の写し・提出物の章は呼び出し側が先に扱う */
export function targetOf(input: TargetInput): TargetOutcome {
  const { kind, name, context, year } = input;
  if (placementOf(kind) === undefined) return stop('S2', `置き場所の表に無い kind: ${kind}`);
  if (context !== null && context !== SHARED_CONTEXT && !isValidContextName(context)) {
    return stop('S5', `context (${context}) がフォルダの名前として使えない`);
  }
  const contextName = context ?? SHARED_CONTEXT;
  const defaulted = context === null;
  const fixed = FIXED_NAMES.get(kind) ?? name;

  if (kind === 'map') return ok(`person/design/shared/${fixed}`);
  if (kind === 'context-map') {
    if (contextName === SHARED_CONTEXT) return stop('S5', 'context-map はまとまりの名前が要る (context が無いか shared)');
    return ok(`person/design/${contextName}/${fixed}`);
  }
  if (kind === 'requirements') return ok(`person/requirements/${name}`);
  if (kind === 'glossary') return ok(`person/design/shared/${fixed}`);
  if (kind === 'decision-log') return ok(`person/decisions/${fixed}`);
  if (kind === 'adr') {
    if (year === null) return stop('S5', 'ADR の年が読めない (created・proposed・adopted・accepted の日付が無い)');
    return ok(`person/decisions/${year}/${name}`);
  }
  if (PERSON_SHARED_FIXED.has(kind)) {
    if (contextName === SHARED_CONTEXT) return ok(`person/design/shared/${fixed}`, defaulted);
    return ok(`person/design/${contextName}/${fixed}`);
  }
  const personDir = PERSON_PER_CONTEXT.get(kind);
  if (personDir !== undefined) return ok(`person/design/${contextName}/${personDir}/${name}`, defaulted);

  if (kind === 'context-contract') {
    if (context === null || contextName === SHARED_CONTEXT) {
      return stop('S5', 'context-contract は、まとまりの名前が要る (context が無いか shared は約束を持たない)');
    }
    return ok(`ai/specs/${contextName}/contract.md`);
  }
  const aiDir = AI_PER_CONTEXT.get(kind);
  if (aiDir !== undefined) return ok(`ai/specs/${contextName}/${aiDir}/${name}`, defaulted);
  if (AI_SHARED.has(kind)) return ok(`ai/specs/shared/${FIXED_NAMES.get(kind) ?? name}`);
  if (kind === 'tasks') return ok(`ai/specs/tasks/${name}`);
  if (kind === 'implementation-order') return ok('ai/handbook/how-to/02-implementation-order.md');
  if (kind === 'guide') return ok(`ai/handbook/how-to/${name}`);
  if (kind === 'explanation') return ok(`ai/handbook/explanation/${name}`);
  if (kind === 'runbook') return ok(`ai/handbook/runbooks/${name}`);
  if (kind === 'proposal') {
    if (year === null) return stop('S5', '提案書の年が読めない (created・proposed・adopted・accepted の日付が無い)');
    return ok(`client/proposals/${year}/${name}`);
  }
  return stop('S2', `行き先を決める規則が無い kind: ${kind}`);
}
