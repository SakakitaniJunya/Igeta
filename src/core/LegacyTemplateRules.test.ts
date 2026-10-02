// node --test dist/core/LegacyTemplateRules.test.js
// 旧い構成の文書を検査する固定表 (REQ-106、ADR-0005 決定 1・3・4) の全体を、SHA256 で固定する。
//   - LEGACY_TEMPLATE_RULES: kind → 必須節・行数上限・ID の接頭辞と形式 (44 kind)
//   - LEGACY_TEMPLATE_PATHS: 置き場所 → kind の対応 (27 フォルダ)
// 表を書き換えると、旧い構成の repo の検査が変わる。表は 1 行も変えてはならない (変えてよいのは、旧い構成を違反にする
// メジャー版 (ADR-0005 決定 1) で、表ごと消すとき)。この 1 本が、1 行の変更でも落ちる。
// 旧い構成の文書がこの表で検査されること (新しい構成の文書は雛形で検査されること) は、DocTemplateCheck.legacyRules.test.ts が見る。
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LEGACY_TEMPLATE_PATHS } from './LegacyTemplatePaths.js';
import { LEGACY_TEMPLATE_RULES } from './LegacyTemplateRules.js';

/**
 * 期待する SHA256。v0.4.0 のタグの templates/docs/ (44 本) から、表と同じ形へ起こした値を JSON にして求めた
 * (今の表の値は写していない)。
 *   rules: [kind, line_limit, id_prefix (id_prefixes の全部)、id_pattern (無ければ numeric)、必須の H2 (連番と「(任意)」の付くものを除く)] を kind の順に並べる
 *   paths: [フォルダ, [[連番を除いたファイル名, kind] を名前の順に], 名前を自由に付ける雛形の kind か null] をフォルダの順に並べる
 */
const EXPECTED_RULES_SHA256 = 'a038cfa326966179011b7222fceb0f0ed075cb751fb5352c845531df381097f0';
const EXPECTED_PATHS_SHA256 = '2a97af486eb1e8fc88b7b04ae4ff79b1bd009616eadcc4702101137aa6423eee';

/** 並べる順は UTF-16 のコード単位の順 (ロケールに依らない) */
const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const sha256 = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

describe('旧い構成の固定表は、v0.4.0 の雛形から起こした値のまま', () => {
  it('必須節・行数上限・ID の接頭辞と形式 (44 kind) と、置き場所 → kind の対応 (27 フォルダ) の全体が、SHA256 で一致する', () => {
    const rules = [...LEGACY_TEMPLATE_RULES]
      .sort(([a], [b]) => byCode(a, b))
      .map(([kind, rule]) => [kind, rule.lineLimit, rule.idPrefixes, rule.idPattern, rule.required]);
    const paths = [...LEGACY_TEMPLATE_PATHS]
      .sort(([a], [b]) => byCode(a, b))
      .map(([dir, slot]) => [dir, [...slot.exact].sort(([a], [b]) => byCode(a, b)), slot.placeholder]);
    assert.deepEqual(
      { kinds: rules.length, folders: paths.length, rules: sha256(rules), paths: sha256(paths) },
      { kinds: 44, folders: 27, rules: EXPECTED_RULES_SHA256, paths: EXPECTED_PATHS_SHA256 },
      '旧い構成の固定表の値が変わった。表の値を変えると、旧い構成の repo の検査が変わる (REQ-106)',
    );
  });
});
