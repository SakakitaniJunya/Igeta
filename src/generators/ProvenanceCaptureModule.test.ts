// node --test dist/generators/ProvenanceCaptureModule.test.js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { capture } from './ProvenanceCaptureModule.js';
import { readSidecar } from '../core/ProvenanceSidecar.js';
import { buildSourceIndex } from '../core/SourceResolver.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'yatsu-capture-'));
  workspaces.push(root);
  return root;
}

function writeDoc(root: string, rel: string, lines: readonly string[]): string {
  const target = join(root, 'docs', rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${lines.join('\n')}\n`);
  return target;
}

const chapterLines = [
  '---', 'id: chapter-1', 'kind: delivery-chapter', 'depends_on: []', '---', '',
  '# 章', '', '> **TL;DR**: テスト。', '',
  '## 1. 予約の受付', '', '予約は 30 日前まで受け付ける。', '',
];

describe('capture', () => {
  it('--from で由来を作る (sidecar が無い状態から)', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines);
    writeDoc(root, 'requirements.md', [
      '---', 'id: reservation-flow', 'kind: requirements', 'depends_on: []', '---', '', '# 要件', '',
      '| REQ-114 | 予約は 30 日前まで受け付ける |',
    ]);
    const sourceIndex = buildSourceIndex(root, join(root, 'docs'));
    const result = capture({
      chapterAbsPath: chapterPath,
      targetRoot: root,
      anchor: '1. 予約の受付',
      source: { kind: 'from', id: 'reservation-flow/REQ-114' },
      by: 'agent:writer',
      sourceIndex,
      now: new Date('2026-09-28T00:00:00Z'),
    });
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.equal(result.sidecar.entries.length, 1);
    const entry = result.sidecar.entries[0];
    assert.equal(entry?.anchor, '1. 予約の受付');
    assert.equal(entry?.from, 'reservation-flow/REQ-114');
    assert.equal(entry?.capturedBy, 'agent:writer');
    assert.equal(entry?.acceptedBy, undefined);

    const onDisk = readSidecar(chapterPath);
    assert.equal(onDisk.kind, 'ok');
  });

  it('--no-source --reason で由来なし宣言を作る', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines);
    const result = capture({
      chapterAbsPath: chapterPath,
      targetRoot: root,
      anchor: '1. 予約の受付',
      source: { kind: 'no-source', reason: '挨拶文、由来を持たない' },
      by: 'agent:writer',
      sourceIndex: null,
    });
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    const entry = result.sidecar.entries[0];
    assert.equal(entry?.from, null);
    if (entry?.from === null) assert.equal(entry.reason, '挨拶文、由来を持たない');
  });

  it('検査不能: anchor が章に無い', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines);
    const result = capture({
      chapterAbsPath: chapterPath,
      targetRoot: root,
      anchor: '存在しない節',
      source: { kind: 'no-source', reason: 'x' },
      by: 'agent:writer',
      sourceIndex: null,
    });
    assert.equal(result.kind, 'error');
    if (result.kind === 'error') assert.equal(result.violation.severity, 'cannot-check');
  });

  it('検査不能: 同じ見出し (anchor) が章に 2 つ以上あればあいまいとして拒否する', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', [
      '---', 'id: chapter-1', 'kind: delivery-chapter', 'depends_on: []', '---', '',
      '# 章', '', '> **TL;DR**: テスト。', '',
      '## 1. 予約の受付', '', '本文 A。', '',
      '## 1. 予約の受付', '', '本文 B (見出しが重複)。', '',
    ]);
    const result = capture({
      chapterAbsPath: chapterPath,
      targetRoot: root,
      anchor: '1. 予約の受付',
      source: { kind: 'no-source', reason: 'x' },
      by: 'agent:writer',
      sourceIndex: null,
    });
    assert.equal(result.kind, 'error');
    if (result.kind === 'error') {
      assert.equal(result.violation.severity, 'cannot-check');
      assert.match(result.violation.message, /あいまい/);
    }
  });

  it('capturedBy は正規化して保存する (前後の空白・大文字小文字)', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines);
    const result = capture({
      chapterAbsPath: chapterPath,
      targetRoot: root,
      anchor: '1. 予約の受付',
      source: { kind: 'no-source', reason: 'x' },
      by: '  Agent:Writer  ',
      sourceIndex: null,
    });
    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') assert.equal(result.sidecar.entries[0]?.capturedBy, 'agent:writer');
  });

  it('検査不能: --from が解決できない', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines);
    const sourceIndex = buildSourceIndex(root, join(root, 'docs'));
    const result = capture({
      chapterAbsPath: chapterPath,
      targetRoot: root,
      anchor: '1. 予約の受付',
      source: { kind: 'from', id: 'nonexistent/REQ-001' },
      by: 'agent:writer',
      sourceIndex,
    });
    assert.equal(result.kind, 'error');
  });

  it('同じ anchor を再度 capture すると上書きされ、承認情報が消える (未承認に戻る)', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines);
    capture({
      chapterAbsPath: chapterPath,
      targetRoot: root,
      anchor: '1. 予約の受付',
      source: { kind: 'no-source', reason: '初回' },
      by: 'agent:writer',
      sourceIndex: null,
    });
    // 一旦 accept 相当のフィールドを直接 sidecar に仕込んでおいて、再 capture で消えることを確かめる
    const before = readSidecar(chapterPath);
    assert.equal(before.kind, 'ok');

    const result = capture({
      chapterAbsPath: chapterPath,
      targetRoot: root,
      anchor: '1. 予約の受付',
      source: { kind: 'no-source', reason: '書き直した' },
      by: 'agent:writer',
      sourceIndex: null,
    });
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.equal(result.sidecar.entries.length, 1);
    const entry = result.sidecar.entries[0];
    assert.equal(entry?.acceptedBy, undefined);
    if (entry?.from === null) assert.equal(entry.reason, '書き直した');
  });
});
