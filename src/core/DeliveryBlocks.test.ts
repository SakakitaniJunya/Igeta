// node --test dist/core/DeliveryBlocks.test.js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractDeliveryBlocks, findDeliveryChapters } from './DeliveryBlocks.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

const chapter = [
  '---',
  'id: chapter-1',
  'kind: delivery-chapter',
  'depends_on: []',
  '---',
  '',
  '# 章のタイトル',
  '',
  '> **TL;DR**: テスト。',
  '',
  '## 関連',
  '',
  '| 区分 | 文書 | 対応 ID |',
  '|---|---|---|',
  '| 上流 | x | y |',
  '',
  '## 1. 予約の受付',
  '',
  '本文 1。',
  '',
  '## 2. ご挨拶',
  '',
  '本文 2。',
  '',
  '```markdown',
  '## 見出し風の例示 (フェンス内なので塊にならない)',
  '```',
  '',
].join('\n');

describe('extractDeliveryBlocks', () => {
  it('H2 節ごとに塊を作る。「関連」節は塊にしない', () => {
    const result = extractDeliveryBlocks(chapter, 'chapter.md');
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    const anchors = result.blocks.map((b) => b.anchor);
    assert.deepEqual(anchors, ['1. 予約の受付', '2. ご挨拶']);
    assert.equal(result.blocks[0]?.text.trim(), '本文 1。');
  });

  it('コードフェンス内の見出し風の行は塊にしない', () => {
    const result = extractDeliveryBlocks(chapter, 'chapter.md');
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.ok(!result.blocks.some((b) => b.anchor.includes('見出し風')));
  });

  it('見出しの元ファイル行番号を保持する', () => {
    const result = extractDeliveryBlocks(chapter, 'chapter.md');
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    const lines = chapter.split('\n');
    const expectedLine = lines.findIndex((l) => l === '## 1. 予約の受付') + 1;
    assert.equal(result.blocks[0]?.line, expectedLine);
  });

  it('AUTOGEN が閉じられていなければ unclosed-autogen を返す', () => {
    const broken = chapter.replace('## 1. 予約の受付', '<!-- AUTOGEN:x:start -->\n## 1. 予約の受付');
    const result = extractDeliveryBlocks(broken, 'chapter.md');
    assert.equal(result.kind, 'unclosed-autogen');
  });
});

describe('findDeliveryChapters', () => {
  it('kind: delivery-chapter の文書だけを集める', () => {
    const root = mkdtempSync(join(tmpdir(), 'igeta-delivery-'));
    workspaces.push(root);
    const write = (rel: string, content: string): void => {
      const target = join(root, rel);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    };
    write('docs/delivery/design-document/02-reservation.md', chapter);
    write('docs/product/requirements.md', ['---', 'id: requirements', 'kind: requirements', 'depends_on: []', '---', '', '# 要件'].join('\n'));

    const files = findDeliveryChapters(join(root, 'docs'));
    assert.equal(files.length, 1);
    assert.ok(files[0]?.endsWith('02-reservation.md'));
  });

  it('docs が無ければ空配列', () => {
    assert.deepEqual(findDeliveryChapters('/nonexistent/docs'), []);
  });
});
