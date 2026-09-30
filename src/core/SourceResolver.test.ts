// node --test dist/core/SourceResolver.test.js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceIndex, resolveSource } from './SourceResolver.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-sourceresolver-'));
  workspaces.push(root);
  return root;
}

function writeDoc(root: string, rel: string, lines: readonly string[]): void {
  const target = join(root, 'docs', rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${lines.join('\n')}\n`);
}

describe('SourceResolver', () => {
  it('行頭セルの ID 定義を解決する', () => {
    const root = makeRoot();
    writeDoc(root, 'requirements.md', [
      '---', 'id: reservation-flow', 'kind: requirements', 'status: draft', 'depends_on: []', '---', '',
      '# 要件', '', '| REQ-114 | 予約は 30 日前まで受け付ける |',
    ]);
    const index = buildSourceIndex(root, join(root, 'docs'));
    assert.ok(index);
    const result = resolveSource(index, 'reservation-flow/REQ-114');
    assert.equal(result.kind, 'row');
    assert.match(result.text, /予約は 30 日前まで受け付ける/);
  });

  it('本文中の言及 (行頭セルでない) は定義に数えない', () => {
    const root = makeRoot();
    writeDoc(root, 'requirements.md', [
      '---', 'id: reservation-flow', 'kind: requirements', 'depends_on: []', '---', '',
      '# 要件', '', 'REQ-114 については他文書を参照。',
    ]);
    const index = buildSourceIndex(root, join(root, 'docs'));
    assert.ok(index);
    assert.equal(resolveSource(index, 'reservation-flow/REQ-114').kind, 'missing');
  });

  it('doc id が存在しなければ missing', () => {
    const root = makeRoot();
    writeDoc(root, 'requirements.md', ['---', 'id: x', 'kind: requirements', 'depends_on: []', '---', '', '# 要件']);
    const index = buildSourceIndex(root, join(root, 'docs'));
    assert.ok(index);
    assert.equal(resolveSource(index, 'nonexistent/REQ-001').kind, 'missing');
  });

  it('`<doc-id>#<見出し>` で節を解決する', () => {
    const root = makeRoot();
    writeDoc(root, 'flow.md', [
      '---', 'id: reservation-flow-doc', 'kind: business-flow', 'depends_on: []', '---', '',
      '# 業務フロー', '', '## 1. 予約の受付', '', '受付の説明。', '', '## 2. 予約の確定', '', '確定の説明。',
    ]);
    const index = buildSourceIndex(root, join(root, 'docs'));
    assert.ok(index);
    const result = resolveSource(index, 'reservation-flow-doc#1. 予約の受付');
    assert.equal(result.kind, 'section');
    assert.match(result.text, /受付の説明。/);
  });

  it('見出しが見つからなければ missing', () => {
    const root = makeRoot();
    writeDoc(root, 'flow.md', ['---', 'id: flow', 'kind: business-flow', 'depends_on: []', '---', '', '# x', '', '## 1. 予約の受付', '', 'a']);
    const index = buildSourceIndex(root, join(root, 'docs'));
    assert.ok(index);
    assert.equal(resolveSource(index, 'flow#2. 予約の確定').kind, 'missing');
  });

  it('clientExempt: true を読む', () => {
    const root = makeRoot();
    writeDoc(root, 'requirements.md', ['---', 'id: x', 'kind: requirements', 'clientExempt: true', 'depends_on: []', '---', '', '# x']);
    const index = buildSourceIndex(root, join(root, 'docs'));
    assert.equal(index?.docs[0]?.clientExempt, true);
  });

  it('docs が無ければ null', () => {
    assert.equal(buildSourceIndex('/x', '/x/docs-nonexistent'), null);
  });
});
