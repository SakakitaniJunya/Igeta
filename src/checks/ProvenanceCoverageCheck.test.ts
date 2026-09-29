// node --test dist/checks/ProvenanceCoverageCheck.test.js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProvenanceCoverageCheck } from './ProvenanceCoverageCheck.js';
import { capture } from '../generators/ProvenanceCaptureModule.js';
import { ExitCode } from '../core/ExitCode.js';
import { Report } from '../core/Report.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'yatsu-provcoverage-'));
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
  '## 1. 予約の受付', '', '本文 1。', '',
  '## 2. ご挨拶', '', '本文 2。', '',
];

function run(root: string): { report: Report } {
  const check = new ProvenanceCoverageCheck({ targetRoot: root });
  const { violations } = check.analyze();
  const report = new Report();
  report.addAll(violations);
  return { report };
}

describe('ProvenanceCoverageCheck', () => {
  it('正常系: 全塊に由来 (from あり・由来なし宣言) があれば通る', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines);
    capture({ chapterAbsPath: chapterPath, targetRoot: root, anchor: '1. 予約の受付', source: { kind: 'no-source', reason: 'x' }, by: 'agent:writer', sourceIndex: null });
    capture({ chapterAbsPath: chapterPath, targetRoot: root, anchor: '2. ご挨拶', source: { kind: 'no-source', reason: '挨拶文' }, by: 'agent:writer', sourceIndex: null });
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('違反: 由来が無い塊が 1 つでもあれば落ちる', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines);
    capture({ chapterAbsPath: chapterPath, targetRoot: root, anchor: '1. 予約の受付', source: { kind: 'no-source', reason: 'x' }, by: 'agent:writer', sourceIndex: null });
    // 「2. ご挨拶」は由来を作らない
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /塊に由来が無い: 2\. ご挨拶/);
  });

  it('違反: sidecar が無い章は全塊が未カバー', () => {
    const root = makeRoot();
    writeDoc(root, 'delivery/02-reservation.md', chapterLines);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /1\. 予約の受付/);
    assert.match(report.format(), /2\. ご挨拶/);
  });

  it('違反: 同じ章に同じ見出し (anchor) が 2 つ以上あれば違反にする', () => {
    const root = makeRoot();
    writeDoc(root, 'delivery/02-reservation.md', [
      '---', 'id: chapter-1', 'kind: delivery-chapter', 'depends_on: []', '---', '',
      '# 章', '', '> **TL;DR**: テスト。', '',
      '## 1. 予約の受付', '', '本文 A。', '',
      '## 1. 予約の受付', '', '本文 B (見出しが重複)。', '',
    ]);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /見出し \(anchor\) が章に 2 件重複している: 1\. 予約の受付/);
  });

  it('正例: delivery-chapter 以外は対象にならない (chapter が 0 件)', () => {
    const root = makeRoot();
    writeDoc(root, 'requirements.md', ['---', 'id: x', 'kind: requirements', 'depends_on: []', '---', '', '# x']);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });
});
