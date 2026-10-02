// 旧い構成 (docs/ 直下に person・ai・client が無い構成) の、置き場所 → kind の対応の固定表。
//
// 旧い構成の repo では、frontmatter に kind が無い文書の kind を、雛形の置き場所から引いていた
// (templates/docs/<パス> と docs/<パス> は同じ。ファイル名先頭の連番 `NN-` は読む順であって種類ではないので無視し、
// 雛形の名前 (`__name__`・`NNNN-__slug__`) はそのフォルダの任意の名前に当たる)。雛形を新しい構成の木
// (person・ai・client。ADR-0005 決定 4) へ移すと、雛形の置き場所は旧い構成の置き場所ではなくなる。旧い構成の
// repo の検査が変わらないよう、移す前の雛形の置き場所が引いていた kind を、ここに固定する (REQ-106)。
//
// 旧い構成を違反にするメジャー版 (ADR-0005 決定 1) で、この表は要らなくなる。新しい構成の kind の解決は
// Role.ts の置き場所の型 (kindOfPath) が持つので、ここには足さない。

import { posix } from 'node:path';

interface LegacySlot {
  /** 連番を除いたファイル名 → kind。固定名の雛形 (`01-function-list.md` → `function-list.md`) */
  readonly exact: ReadonlyMap<string, string>;
  /** 完全一致しないファイル名の kind。名前を自由に付ける雛形 (`__flow__.md` など) があるフォルダだけ持つ */
  readonly placeholder: string | null;
}

const slot = (exact: Readonly<Record<string, string>>, placeholder: string | null = null): LegacySlot => ({
  exact: new Map(Object.entries(exact)),
  placeholder,
});

/** docs/ からの相対のフォルダ (docs/ 直下は空文字) → そのフォルダに置く文書の kind の決め方 */
const LEGACY_SLOTS: ReadonlyMap<string, LegacySlot> = new Map([
  ['', slot({ 'map.md': 'map', 'decisions.md': 'decision-log' })],
  ['adr', slot({}, 'adr')],
  ['architecture', slot({ 'overview.md': 'as-is-overview', 'glossary.md': 'glossary' })],
  ['contexts/contracts', slot({}, 'context-contract')],
  ['contexts/maps', slot({}, 'context-map')],
  ['delivery', slot({}, 'delivery-chapter')],
  ['design', slot({ 'risks-tech-debt.md': 'risks-tech-debt' })],
  [
    'design/basic',
    slot({
      'function-list.md': 'function-list',
      'solution-strategy.md': 'solution-strategy',
      'nonfunctional.md': 'nonfunctional',
      'crosscutting.md': 'crosscutting',
      'code-definitions.md': 'code-definitions',
      'messages.md': 'messages',
      'permission-matrix.md': 'permission-matrix',
      'infra-design.md': 'infra-design',
      'i18n.md': 'i18n',
    }),
  ],
  ['design/basic/api', slot({}, 'api-spec')],
  ['design/basic/flows', slot({}, 'business-flow')],
  ['design/basic/screens', slot({}, 'screen-spec')],
  ['design/basic/tables', slot({}, 'table-spec')],
  ['design/detail/domain', slot({ 'overview.md': 'domain-overview', 'aggregate-map.md': 'aggregate-map' }, 'domain-model')],
  ['design/detail/jobs', slot({}, 'job')],
  ['design/detail/modules', slot({}, 'module-spec')],
  ['design/detail/sequences', slot({}, 'sequence-spec')],
  ['design/detail/state-machines', slot({}, 'state-machine')],
  ['design/ops', slot({ 'operations.md': 'operations', 'migration-plan.md': 'migration-plan' })],
  ['design/tasks', slot({}, 'tasks')],
  ['design/test', slot({ 'test-plan.md': 'test-plan' })],
  ['design/test/specs', slot({}, 'test-spec')],
  ['explanation', slot({}, 'explanation')],
  [
    'guides',
    slot(
      {
        'document-taxonomy.md': 'document-taxonomy',
        'implementation-order.md': 'implementation-order',
        'human-review.md': 'human-review',
        'provenance-workflow.md': 'provenance-workflow',
      },
      'guide',
    ),
  ],
  ['product', slot({ 'requirements.md': 'requirements' })],
  ['product/features', slot({}, 'feature-brief')],
  ['proposal', slot({}, 'proposal')],
  ['runbooks', slot({}, 'runbook')],
]);

/** ファイル名先頭の連番 (01-, 12-) を外す */
const withoutSeq = (name: string): string => name.replace(/^\d{2}-/, '');

/**
 * 旧い構成の置き場所から kind を引く。docs/ からの相対パス (区切りは `/`)。完全一致のファイル名 (連番抜き) を先に、
 * 無ければそのフォルダの雛形の名前の kind。表に無いフォルダ、固定名だけのフォルダの別名のファイルは null
 * (kind を決められない文書は、frontmatter の kind に頼る)。
 */
export function legacyKindOfPath(docsRelPath: string): string | null {
  const dir = posix.dirname(docsRelPath);
  const found = LEGACY_SLOTS.get(dir === '.' ? '' : dir);
  if (found === undefined) return null;
  return found.exact.get(withoutSeq(posix.basename(docsRelPath))) ?? found.placeholder;
}
