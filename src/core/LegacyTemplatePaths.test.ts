// node --test dist/core/LegacyTemplatePaths.test.js
// 雛形を新しい構成の木へ移しても、旧い構成の repo の kind の解決が変わらないこと (REQ-106、ADR-0005 決定 4)。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { legacyKindOfPath } from './LegacyTemplatePaths.js';

/**
 * 雛形を移す前の templates/docs/ にあった、kind を持つ雛形の全部 (44 本)。[docs/ 側の同じパス, kind]。
 * 移す前の雛形から機械的に起こした固定の一覧で、雛形の置き場所を変えても書き換えない。
 */
const BEFORE_MOVE: ReadonlyArray<readonly [string, string]> = [
  ['00-map.md', 'map'],
  ['01-decisions.md', 'decision-log'],
  ['adr/NNNN-__slug__.md', 'adr'],
  ['architecture/01-overview.md', 'as-is-overview'],
  ['architecture/02-glossary.md', 'glossary'],
  ['contexts/contracts/__context__.md', 'context-contract'],
  ['contexts/maps/__context__.md', 'context-map'],
  ['delivery/__chapter__.md', 'delivery-chapter'],
  ['design/01-risks-tech-debt.md', 'risks-tech-debt'],
  ['design/basic/01-function-list.md', 'function-list'],
  ['design/basic/02-solution-strategy.md', 'solution-strategy'],
  ['design/basic/03-nonfunctional.md', 'nonfunctional'],
  ['design/basic/04-crosscutting.md', 'crosscutting'],
  ['design/basic/05-code-definitions.md', 'code-definitions'],
  ['design/basic/06-messages.md', 'messages'],
  ['design/basic/07-permission-matrix.md', 'permission-matrix'],
  ['design/basic/08-infra-design.md', 'infra-design'],
  ['design/basic/09-i18n.md', 'i18n'],
  ['design/basic/api/__resource__.md', 'api-spec'],
  ['design/basic/flows/__flow__.md', 'business-flow'],
  ['design/basic/screens/__screen-group__.md', 'screen-spec'],
  ['design/basic/tables/__context__.md', 'table-spec'],
  ['design/detail/domain/__context__.md', 'domain-model'],
  ['design/detail/domain/01-overview.md', 'domain-overview'],
  ['design/detail/domain/02-aggregate-map.md', 'aggregate-map'],
  ['design/detail/jobs/__job__.md', 'job'],
  ['design/detail/modules/__context__.md', 'module-spec'],
  ['design/detail/sequences/__use-case__.md', 'sequence-spec'],
  ['design/detail/state-machines/__aggregate__.md', 'state-machine'],
  ['design/ops/01-operations.md', 'operations'],
  ['design/ops/02-migration-plan.md', 'migration-plan'],
  ['design/tasks/__feature__.md', 'tasks'],
  ['design/test/01-test-plan.md', 'test-plan'],
  ['design/test/specs/__feature__.md', 'test-spec'],
  ['explanation/__slug__.md', 'explanation'],
  ['guides/__slug__.md', 'guide'],
  ['guides/01-document-taxonomy.md', 'document-taxonomy'],
  ['guides/02-implementation-order.md', 'implementation-order'],
  ['guides/03-human-review.md', 'human-review'],
  ['guides/04-provenance-workflow.md', 'provenance-workflow'],
  ['product/01-requirements.md', 'requirements'],
  ['product/features/__feature__.md', 'feature-brief'],
  ['proposal/__slug__.md', 'proposal'],
  ['runbooks/__scenario__.md', 'runbook'],
];

describe('legacyKindOfPath: 移す前の全部の雛形のパスが、同じ kind に解決される', () => {
  it('一覧は 44 本で、kind は重複しない', () => {
    assert.equal(BEFORE_MOVE.length, 44);
    assert.equal(new Set(BEFORE_MOVE.map(([, kind]) => kind)).size, 44);
  });

  for (const [path, kind] of BEFORE_MOVE) {
    it(`${path} → ${kind}`, () => {
      assert.equal(legacyKindOfPath(path), kind);
    });
  }
});

describe('legacyKindOfPath: 旧い構成のパスの読み方 (雛形を移す前と同じ)', () => {
  it('固定名の文書は、連番が雛形と違っても同じ kind (連番は読む順であって種類ではない)', () => {
    assert.equal(legacyKindOfPath('design/basic/99-function-list.md'), 'function-list');
    assert.equal(legacyKindOfPath('design/basic/function-list.md'), 'function-list');
    assert.equal(legacyKindOfPath('product/requirements.md'), 'requirements');
    assert.equal(legacyKindOfPath('decisions.md'), 'decision-log');
  });

  it('雛形の名前 (`__name__`) があるフォルダは、完全一致しない任意の名前が、その雛形の kind', () => {
    assert.equal(legacyKindOfPath('design/basic/flows/01-booking.md'), 'business-flow');
    assert.equal(legacyKindOfPath('design/detail/domain/booking.md'), 'domain-model');
    assert.equal(legacyKindOfPath('guides/anything.md'), 'guide');
    assert.equal(legacyKindOfPath('adr/0001-modular-monolith.md'), 'adr');
  });

  it('固定名だけのフォルダの別名のファイル・表に無いフォルダは、kind を決められない (null)', () => {
    assert.equal(legacyKindOfPath('design/basic/unknown.md'), null);
    assert.equal(legacyKindOfPath('design/ops/runbook.md'), null);
    assert.equal(legacyKindOfPath('misc/01-notes.md'), null);
    assert.equal(legacyKindOfPath('design/basic/flows/sub/01-x.md'), null);
  });

  it('新しい構成の置き場所 (person・ai・client) は、この表に入れない', () => {
    assert.equal(legacyKindOfPath('person/design/shared/00-map.md'), null);
    assert.equal(legacyKindOfPath('ai/specs/shared/01-crosscutting.md'), null);
    assert.equal(legacyKindOfPath('client/proposals/2026/01-x.md'), null);
  });
});
