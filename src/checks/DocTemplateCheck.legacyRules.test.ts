// node --test dist/checks/DocTemplateCheck.legacyRules.test.js
// 旧い構成の文書は、雛形を新しい構成の木へ移す前の必須節・行数上限・ID の接頭辞と形式 (core/LegacyTemplateRules.ts) で
// 検査され、新しい構成の文書は雛形そのもので検査されること (REQ-106、ADR-0005 決定 1・3・4)。
// 雛形は、旧い構成の値と食い違うように作った一時の置き場に置く (実際の雛形が今後変わっても、このテストは動く)。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Violation } from '../core/Report.js';
import { DocTemplateCheck } from './DocTemplateCheck.js';

const workspaces: string[] = [];

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

/** 旧い構成の function-list の雛形の必須節 (LEGACY_TEMPLATE_RULES と同じ) */
const LEGACY_SECTIONS = ['機能一覧', '機能別の状態・権限', 'カバレッジ確認'];

/** 雛形と食い違う function-list の雛形: 必須節が 1 つ多く、行数上限が 20 行、ID は ZZ001 の形 (旧い構成の値は FN-nnn) */
const LIVE_TEMPLATE = [
  '---',
  'id: <kebab-slug>',
  'kind: function-list',
  'arc42: 1',
  'id_prefix: ZZ',
  'id_pattern: bare-numeric',
  'line_limit: 20',
  'depends_on: []',
  'relates_to: []',
  '---',
  '',
  '# 機能一覧',
  '',
  '> **TL;DR**: 雛形。',
  '',
  '## 関連',
  '',
  '| 区分 | 文書 | 対応 ID |',
  '|---|---|---|',
  '| 上流 (depends_on) | なし | — |',
  '| 下流 | (生成索引が出す) | — |',
  '',
  '## 機能一覧',
  '',
  '| ZZ001 | 内容 |',
  '',
  '## 新しい節',
  '',
].join('\n');

/** 旧い構成の必須節を満たす function-list。長さは filler 行で調整する */
function functionListDoc(id: string, fillerLines = 0): string {
  return [
    '---',
    `id: ${id}`,
    'kind: function-list',
    'arc42: 1',
    'depends_on: []',
    'relates_to: []',
    '---',
    '',
    '# 機能一覧',
    '',
    '> **TL;DR**: 機能一覧。',
    '',
    '## 関連',
    '',
    '| 区分 | 文書 | 対応 ID |',
    '|---|---|---|',
    '| 上流 (depends_on) | なし | — |',
    '| 下流 | なし | — |',
    '',
    ...LEGACY_SECTIONS.flatMap((section) => [`## ${section}`, '', '| FN-001 | 内容 |', '']),
    ...Array.from({ length: fillerLines }, () => 'x'),
    '',
  ].join('\n');
}

function analyze(docs: Readonly<Record<string, string>>): readonly Violation[] {
  const root = mkdtempSync(join(tmpdir(), 'igeta-legacyrules-'));
  workspaces.push(root);
  const write = (path: string, content: string): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  write(join(root, 'templates', 'docs', 'person', 'design', 'shared', '01-function-list.md'), LIVE_TEMPLATE);
  for (const [relPath, content] of Object.entries(docs)) write(join(root, 'docs', relPath), content);
  const result = new DocTemplateCheck({ requireKind: true }).analyze({ targetRoot: root, igetaRoot: root });
  return result.violations;
}

const messagesOf = (violations: readonly Violation[], file: string): readonly string[] =>
  violations.filter((violation) => (violation.file ?? '').split('\\').join('/') === `docs/${file}`).map((violation) => violation.message);

describe('DocTemplateCheck: 旧い構成の文書は旧い構成の必須節で、新しい構成の文書は雛形で検査する', () => {
  it('旧い構成の置き場所の文書は、雛形が求める新しい節が無くても通る', () => {
    const violations = analyze({ 'design/basic/function-list.md': functionListDoc('legacy-function-list') });
    assert.deepEqual(messagesOf(violations, 'design/basic/function-list.md'), []);
  });

  it('新しい構成の置き場所の文書は、雛形が求める節が無ければ違反になる', () => {
    const violations = analyze({ 'person/design/shared/01-function-list.md': functionListDoc('v4-function-list') });
    assert.ok(messagesOf(violations, 'person/design/shared/01-function-list.md').some((message) => message.includes('必須の節がない: ## 新しい節')));
  });

  it('旧い構成の文書には行数上限が無く (旧い構成の function-list は上限なし)、新しい構成の文書には雛形の上限がかかる', () => {
    const violations = analyze({
      'design/basic/function-list.md': functionListDoc('legacy-function-list', 60),
      'person/design/shared/01-function-list.md': functionListDoc('v4-function-list', 60),
    });
    assert.deepEqual(messagesOf(violations, 'design/basic/function-list.md'), []);
    assert.ok(messagesOf(violations, 'person/design/shared/01-function-list.md').some((message) => message.includes('行数上限 (20) を超えている')));
  });

  it('ID の接頭辞・形式は、旧い構成の文書は旧い構成の値 (FN-nnn) で検査し、新しい構成の文書は雛形の値 (ZZ001) で検査する', () => {
    const violations = analyze({
      'design/basic/function-list.md': functionListDoc('legacy-function-list').replace('| FN-001 | 内容 |', '| FN-1 | 内容 |'),
      'person/design/shared/01-function-list.md': functionListDoc('v4-function-list'),
    });
    assert.deepEqual(messagesOf(violations, 'design/basic/function-list.md'), ['ID 形式が不正: FN-1 (FN-nnn の 3 桁)']);
    assert.ok(messagesOf(violations, 'person/design/shared/01-function-list.md').some((message) => message.includes('ZZnnn の ID が 1 件もない')));
  });
});
