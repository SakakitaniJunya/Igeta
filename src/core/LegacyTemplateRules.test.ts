// node --test dist/core/LegacyTemplateRules.test.js
// 旧い構成の文書を検査する、雛形の必須節と行数上限の固定表 (REQ-106、ADR-0005 決定 1・3・4)。
// 表の値は、雛形を移す前の templates/docs/ の 44 本から機械的に起こした。ここでは表の形と、行数上限を持つ kind を固定する。
// 旧い構成の文書がこの表で検査されること (新しい構成の文書は雛形で検査されること) は、DocTemplateCheck.legacyRules.test.ts が見る。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LEGACY_TEMPLATE_RULES } from './LegacyTemplateRules.js';

describe('LEGACY_TEMPLATE_RULES: 移す前の雛形の必須節と行数上限', () => {
  it('移す前の雛形 44 kind を持ち、新しい kind (data-management) は持たない', () => {
    assert.equal(LEGACY_TEMPLATE_RULES.size, 44);
    assert.equal(LEGACY_TEMPLATE_RULES.has('data-management'), false);
  });

  it('全 kind が「関連」を必須の節の先頭に持ち、必須の節に重複がない', () => {
    for (const [kind, rule] of LEGACY_TEMPLATE_RULES) {
      assert.equal(rule.required[0], '関連', kind);
      assert.equal(new Set(rule.required).size, rule.required.length, kind);
    }
  });

  it('行数上限を持つのは、地図・まとまりの地図・まとまりの約束・機能ブリーフの 4 kind だけ (150 行)', () => {
    const limited = [...LEGACY_TEMPLATE_RULES].filter(([, rule]) => rule.lineLimit !== null).map(([kind, rule]) => [kind, rule.lineLimit]);
    assert.deepEqual(limited.sort(), [
      ['context-contract', 150],
      ['context-map', 150],
      ['feature-brief', 150],
      ['map', 150],
    ]);
  });

  it('移す前の必須節を、そのまま持つ (人の型へ作り直す前の節)', () => {
    assert.deepEqual(LEGACY_TEMPLATE_RULES.get('function-list')?.required, ['関連', '機能一覧', '機能別の状態・権限', 'カバレッジ確認']);
    assert.deepEqual(LEGACY_TEMPLATE_RULES.get('requirements')?.required, ['関連', '業務要件', '機能要件', '制約', '前提', 'スコープ外']);
    assert.deepEqual(LEGACY_TEMPLATE_RULES.get('solution-strategy')?.required, [
      '関連',
      '技術選定の要約',
      '分割方針',
      '品質目標の達成手段',
      '主要な設計判断 (ADR 一覧)',
    ]);
    assert.ok(LEGACY_TEMPLATE_RULES.get('domain-model')?.required.includes('未決事項'));
    assert.ok(LEGACY_TEMPLATE_RULES.get('infra-design')?.required.includes('費用'));
  });
});
