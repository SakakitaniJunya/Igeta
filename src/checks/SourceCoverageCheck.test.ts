// node --test dist/checks/SourceCoverageCheck.test.js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SourceCoverageCheck } from './SourceCoverageCheck.js';
import { capture } from '../generators/ProvenanceCaptureModule.js';
import { ExitCode } from '../core/ExitCode.js';
import { Report } from '../core/Report.js';
import type { Violation } from '../core/Report.js';
import { buildSourceIndex } from '../core/SourceResolver.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'yatsu-sourcecoverage-'));
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
];

function run(root: string): { report: Report; violations: readonly Violation[] } {
  const check = new SourceCoverageCheck();
  const violations = check.run({ targetRoot: root, igetaRoot: root });
  const report = new Report();
  report.addAll(violations);
  return { report, violations };
}

describe('SourceCoverageCheck', () => {
  it('正常系: 全 REQ が由来に現れていれば通る', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines);
    writeDoc(root, 'requirements.md', [
      '---', 'id: reservation-flow', 'kind: requirements', 'depends_on: []', '---', '', '# 要件', '',
      '| REQ-114 | 予約は 30 日前まで受け付ける |',
    ]);
    const sourceIndex = buildSourceIndex(root, join(root, 'docs'));
    capture({
      chapterAbsPath: chapterPath, targetRoot: root, anchor: '1. 予約の受付',
      source: { kind: 'from', id: 'reservation-flow/REQ-114' }, by: 'agent:writer', sourceIndex,
    });
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('違反: 由来に現れない REQ が 1 件でもあれば落ちる', () => {
    const root = makeRoot();
    writeDoc(root, 'requirements.md', [
      '---', 'id: reservation-flow', 'kind: requirements', 'depends_on: []', '---', '', '# 要件', '',
      '| REQ-114 | 予約は 30 日前まで受け付ける |',
      '| REQ-115 | 予約はキャンセルできる |',
    ]);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /未参照: reservation-flow\/REQ-114/);
    assert.match(report.format(), /未参照: reservation-flow\/REQ-115/);
  });

  it('対象外: clientExempt: true の文書は文書単位で除外する', () => {
    const root = makeRoot();
    writeDoc(root, 'requirements.md', [
      '---', 'id: reservation-flow', 'kind: requirements', 'clientExempt: true', 'depends_on: []', '---', '', '# 要件', '',
      '| REQ-114 | 予約は 30 日前まで受け付ける |',
    ]);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('対象外: .igeta.json の coverageExemptions は行単位で除外する', () => {
    const root = makeRoot();
    writeDoc(root, 'requirements.md', [
      '---', 'id: reservation-flow', 'kind: requirements', 'depends_on: []', '---', '', '# 要件', '',
      '| REQ-999 | 内部専用 API |',
    ]);
    writeFileSync(
      join(root, '.igeta.json'),
      JSON.stringify({ coverageExemptions: [{ id: 'reservation-flow/REQ-999', reason: '内部専用 API、顧客要件外' }] }),
    );
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('正例: delivery-chapter 自身は正本として数えない', () => {
    const root = makeRoot();
    writeDoc(root, 'delivery/02-reservation.md', chapterLines);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('検査不能: docs が無い', () => {
    const root = makeRoot();
    rmSync(join(root, 'docs'), { recursive: true, force: true });
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
  });
});
