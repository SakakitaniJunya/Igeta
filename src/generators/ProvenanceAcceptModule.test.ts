// node --test dist/generators/ProvenanceAcceptModule.test.js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { accept } from './ProvenanceAcceptModule.js';
import { capture } from './ProvenanceCaptureModule.js';
import { computeFingerprint } from '../core/Fingerprint.js';
import { buildLinkTable } from '../core/LinkTable.js';
import { readSidecar } from '../core/ProvenanceSidecar.js';
import { buildSourceIndex } from '../core/SourceResolver.js';
import { rebaseFingerprints } from './FingerprintRebaseModule.js';
import { ANCHOR_ROW, CHAPTER, ROW_101, cleanupWorkspaces, makeLegacyRepo, readEntries } from './rebaseFixture.test-support.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});
after(cleanupWorkspaces);

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-accept-'));
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

function setup(): { root: string; chapterPath: string; chapterRelPath: string } {
  const root = makeRoot();
  const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines);
  writeDoc(root, 'requirements.md', [
    '---', 'id: reservation-flow', 'kind: requirements', 'depends_on: []', '---', '', '# 要件', '',
    '| REQ-114 | 予約は 30 日前まで受け付ける |',
  ]);
  capture({
    chapterAbsPath: chapterPath,
    targetRoot: root,
    anchor: '1. 予約の受付',
    source: { kind: 'from', id: 'reservation-flow/REQ-114' },
    by: 'agent:writer',
    sourceIndex: buildSourceIndex(root, join(root, 'docs')),
    now: new Date('2026-09-28T00:00:00Z'),
  });
  return { root, chapterPath, chapterRelPath: relative(root, chapterPath) };
}

describe('accept', () => {
  it('別の主体なら受け入れ、指紋を今の値に更新する', () => {
    const { root, chapterPath, chapterRelPath } = setup();
    const result = accept({
      targetRoot: root,
      chapterAbsPath: chapterPath,
      chapterRelPath,
      target: { kind: 'anchor', anchor: '1. 予約の受付' },
      by: 'reviewer@example.com',
      sourceIndex: buildSourceIndex(root, join(root, 'docs')),
      now: new Date('2026-09-29T00:00:00Z'),
    });
    assert.equal(result.violations.length, 0, JSON.stringify(result));
    assert.deepEqual(result.accepted, ['1. 予約の受付']);
    const sidecar = readSidecar(chapterPath);
    assert.equal(sidecar.kind, 'ok');
    if (sidecar.kind !== 'ok') return;
    const entry = sidecar.sidecar.entries[0];
    assert.equal(entry?.acceptedBy, 'reviewer@example.com');
    assert.equal(entry?.acceptedAt, '2026-09-29');
  });

  it('拒否: capturedBy と同じ主体は self-approved で Violation、sidecar は書き換わらない', () => {
    const { root, chapterPath, chapterRelPath } = setup();
    const result = accept({
      targetRoot: root,
      chapterAbsPath: chapterPath,
      chapterRelPath,
      target: { kind: 'anchor', anchor: '1. 予約の受付' },
      by: 'agent:writer',
      sourceIndex: buildSourceIndex(root, join(root, 'docs')),
    });
    assert.equal(result.violations.length, 1);
    assert.match(result.violations[0]?.message ?? '', /self-approved/);
    assert.deepEqual(result.accepted, []);
    const sidecar = readSidecar(chapterPath);
    assert.equal(sidecar.kind, 'ok');
    if (sidecar.kind !== 'ok') return;
    assert.equal(sidecar.sidecar.entries[0]?.acceptedBy, undefined);
  });

  it('拒否: 前後の空白・大文字小文字だけ違う同一主体も self-approved になる', () => {
    const { root, chapterPath, chapterRelPath } = setup(); // capturedBy: 'agent:writer'
    const result = accept({
      targetRoot: root,
      chapterAbsPath: chapterPath,
      chapterRelPath,
      target: { kind: 'anchor', anchor: '1. 予約の受付' },
      by: '  Agent:Writer  ',
      sourceIndex: buildSourceIndex(root, join(root, 'docs')),
    });
    assert.equal(result.violations.length, 1);
    assert.match(result.violations[0]?.message ?? '', /self-approved/);
  });

  it('--all: 複数件を一括で accept できる', () => {
    const { root, chapterPath, chapterRelPath } = setup();
    // 2 件目 (由来なし宣言) を足す
    capture({
      chapterAbsPath: chapterPath,
      targetRoot: root,
      anchor: '1. 予約の受付',
      source: { kind: 'from', id: 'reservation-flow/REQ-114' },
      by: 'agent:writer',
      sourceIndex: buildSourceIndex(root, join(root, 'docs')),
    });
    const result = accept({
      targetRoot: root,
      chapterAbsPath: chapterPath,
      chapterRelPath,
      target: { kind: 'all' },
      by: 'reviewer@example.com',
      sourceIndex: buildSourceIndex(root, join(root, 'docs')),
    });
    assert.equal(result.violations.length, 0, JSON.stringify(result));
    assert.deepEqual(result.accepted, ['1. 予約の受付']);
  });

  it('検査不能: sidecar が無い', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines);
    const result = accept({
      targetRoot: root,
      chapterAbsPath: chapterPath,
      chapterRelPath: 'docs/delivery/02-reservation.md',
      target: { kind: 'all' },
      by: 'reviewer@example.com',
      sourceIndex: null,
    });
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]?.severity, 'cannot-check');
  });

  it('検査不能: 指定した anchor の由来が無い', () => {
    const { root, chapterPath, chapterRelPath } = setup();
    const result = accept({
      targetRoot: root,
      chapterAbsPath: chapterPath,
      chapterRelPath,
      target: { kind: 'anchor', anchor: '存在しない節' },
      by: 'reviewer@example.com',
      sourceIndex: buildSourceIndex(root, join(root, 'docs')),
    });
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]?.severity, 'cannot-check');
  });

  it('検査不能 (orphan 相当): anchor が章から消えていたら accept できない', () => {
    const { root, chapterPath, chapterRelPath } = setup();
    writeFileSync(chapterPath, chapterLines.join('\n').replace('## 1. 予約の受付', '## 1. 予約の受付 (改題)') + '\n');
    const result = accept({
      targetRoot: root,
      chapterAbsPath: chapterPath,
      chapterRelPath,
      target: { kind: 'anchor', anchor: '1. 予約の受付' },
      by: 'reviewer@example.com',
      sourceIndex: buildSourceIndex(root, join(root, 'docs')),
    });
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]?.severity, 'cannot-check');
    assert.match(result.violations[0]?.message ?? '', /orphan/);
  });
});

describe('accept: 載せ替えた後のエントリ', () => {
  it('指紋を今の本文から計算し直す (v3) ので、載せ替えの記録 (rebasedFrom / rebasedAt / rebasedBy) は引き継がず、承認は新しい承認者のものになる', () => {
    const repo = makeLegacyRepo();
    rebaseFingerprints({ targetRoot: repo.root, docsDir: repo.docsDir, dir: repo.docsDir, now: new Date('2026-10-02T00:00:00Z') });
    const rebased = readEntries(repo.chapterPath)[0];
    assert.ok(rebased !== undefined && rebased.from !== null);
    assert.equal(rebased.rebasedBy, 'igeta');

    const sourceIndex = buildSourceIndex(repo.root, repo.docsDir);
    const result = accept({
      targetRoot: repo.root,
      chapterAbsPath: repo.chapterPath,
      chapterRelPath: CHAPTER,
      target: { kind: 'anchor', anchor: ANCHOR_ROW },
      by: 'second-reviewer@example.com',
      sourceIndex,
      now: new Date('2026-10-05T00:00:00Z'),
    });
    assert.deepEqual(result.violations, []);
    const entry = readEntries(repo.chapterPath)[0];
    assert.ok(entry !== undefined && entry.from !== null);
    assert.equal(entry.acceptedBy, 'second-reviewer@example.com');
    assert.equal(entry.acceptedAt, '2026-10-05');
    assert.equal(entry.normalizationVersion, 3);
    assert.equal(entry.fingerprint, computeFingerprint(ROW_101, 3, buildLinkTable(repo.root, sourceIndex).rewriterFor('docs/requirements/reservation.md')));
    assert.equal('rebasedFrom' in entry, false);
    assert.equal('rebasedAt' in entry, false);
    assert.equal('rebasedBy' in entry, false);
  });
});
