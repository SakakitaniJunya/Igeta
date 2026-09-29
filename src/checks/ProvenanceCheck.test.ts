// node --test dist/checks/ProvenanceCheck.test.js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProvenanceCheck } from './ProvenanceCheck.js';
import { accept } from '../generators/ProvenanceAcceptModule.js';
import { capture } from '../generators/ProvenanceCaptureModule.js';
import { sidecarPathFor } from '../core/ProvenanceSidecar.js';
import { buildSourceIndex } from '../core/SourceResolver.js';
import { ExitCode } from '../core/ExitCode.js';
import { Report } from '../core/Report.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'yatsu-provcheck-'));
  workspaces.push(root);
  return root;
}

function writeDoc(root: string, rel: string, lines: readonly string[]): string {
  const target = join(root, 'docs', rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${lines.join('\n')}\n`);
  return target;
}

const chapterLines = (heading = '1. 予約の受付'): string[] => [
  '---', 'id: chapter-1', 'kind: delivery-chapter', 'depends_on: []', '---', '',
  '# 章', '', '> **TL;DR**: テスト。', '',
  `## ${heading}`, '', '予約は 30 日前まで受け付ける。', '',
];

function requirementsDoc(row = '予約は 30 日前まで受け付ける', status = 'draft'): string[] {
  return [
    '---', 'id: reservation-flow', 'kind: requirements', `status: ${status}`, 'depends_on: []', '---', '', '# 要件', '',
    `| REQ-114 | ${row} |`,
  ];
}

function runCheck(root: string, opts: { strictNormalization?: boolean } = {}): { report: Report; warnings: readonly string[] } {
  const check = new ProvenanceCheck({ targetRoot: root, strictNormalization: opts.strictNormalization });
  const { violations } = check.analyze();
  const report = new Report();
  report.addAll(violations);
  return { report, warnings: check.warnings };
}

describe('ProvenanceCheck', () => {
  it('正常系: capture → accept 済みで内容が変わっていなければ ok', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines());
    writeDoc(root, 'requirements.md', requirementsDoc());
    const sourceIndex = buildSourceIndex(root, join(root, 'docs'));
    capture({ chapterAbsPath: chapterPath, targetRoot: root, anchor: '1. 予約の受付', source: { kind: 'from', id: 'reservation-flow/REQ-114' }, by: 'agent:writer', sourceIndex });
    accept({ chapterAbsPath: chapterPath, chapterRelPath: 'docs/delivery/02-reservation.md', target: { kind: 'all' }, by: 'reviewer@example.com', sourceIndex });
    const { report } = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('正常系: 正本の整形だけの変更 (表の列幅) では stale にならない', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines());
    writeDoc(root, 'requirements.md', requirementsDoc());
    const sourceIndex1 = buildSourceIndex(root, join(root, 'docs'));
    capture({ chapterAbsPath: chapterPath, targetRoot: root, anchor: '1. 予約の受付', source: { kind: 'from', id: 'reservation-flow/REQ-114' }, by: 'agent:writer', sourceIndex: sourceIndex1 });
    accept({ chapterAbsPath: chapterPath, chapterRelPath: 'docs/delivery/02-reservation.md', target: { kind: 'all' }, by: 'reviewer@example.com', sourceIndex: sourceIndex1 });

    // 表の整形だけ変える (列幅の空白を増やす)。内容は同じ。
    writeDoc(root, 'requirements.md', [
      '---', 'id: reservation-flow', 'kind: requirements', 'status: draft', 'depends_on: []', '---', '', '# 要件', '',
      '| REQ-114   | 予約は 30 日前まで受け付ける   |',
    ]);
    const { report } = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('違反: 正本の内容が変わったら stale (正本のファイル:行が分かる)', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines());
    writeDoc(root, 'requirements.md', requirementsDoc());
    const sourceIndex1 = buildSourceIndex(root, join(root, 'docs'));
    capture({ chapterAbsPath: chapterPath, targetRoot: root, anchor: '1. 予約の受付', source: { kind: 'from', id: 'reservation-flow/REQ-114' }, by: 'agent:writer', sourceIndex: sourceIndex1 });
    accept({ chapterAbsPath: chapterPath, chapterRelPath: 'docs/delivery/02-reservation.md', target: { kind: 'all' }, by: 'reviewer@example.com', sourceIndex: sourceIndex1 });

    writeDoc(root, 'requirements.md', requirementsDoc('予約は 60 日前まで受け付ける'));
    const { report } = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /stale \(docs[\\/]requirements\.md:\d+\)/);
  });

  it('違反: 見出しを変えると orphan', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines());
    capture({ chapterAbsPath: chapterPath, targetRoot: root, anchor: '1. 予約の受付', source: { kind: 'no-source', reason: 'x' }, by: 'agent:writer', sourceIndex: null });
    accept({ chapterAbsPath: chapterPath, chapterRelPath: 'docs/delivery/02-reservation.md', target: { kind: 'all' }, by: 'reviewer@example.com', sourceIndex: null });

    writeFileSync(chapterPath, chapterLines('1. 予約の受付 (改題)').join('\n') + '\n');
    const { report } = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /orphan\b/);
  });

  it('違反: 由来なしの塊を書き換えると orphan-content', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines());
    capture({ chapterAbsPath: chapterPath, targetRoot: root, anchor: '1. 予約の受付', source: { kind: 'no-source', reason: 'x' }, by: 'agent:writer', sourceIndex: null });
    accept({ chapterAbsPath: chapterPath, chapterRelPath: 'docs/delivery/02-reservation.md', target: { kind: 'all' }, by: 'reviewer@example.com', sourceIndex: null });

    writeFileSync(
      chapterPath,
      [
        '---', 'id: chapter-1', 'kind: delivery-chapter', 'depends_on: []', '---', '',
        '# 章', '', '> **TL;DR**: テスト。', '',
        '## 1. 予約の受付', '', '書き換えた本文。', '',
      ].join('\n') + '\n',
    );
    const { report } = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /orphan-content/);
  });

  it('違反: 自己承認 (self-approved) は sidecar を直接書いても検出する', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines());
    writeFileSync(
      sidecarPathFor(chapterPath),
      JSON.stringify({
        sourceDoc: 'docs/delivery/02-reservation.md',
        entries: [
          {
            anchor: '1. 予約の受付', from: null, reason: 'x', blockFingerprint: 'sha256:bogus',
            capturedBy: 'agent:writer', capturedAt: '2026-09-28',
            acceptedBy: 'agent:writer', acceptedAt: '2026-09-28', normalizationVersion: 1,
          },
        ],
      }),
    );
    const { report } = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /self-approved/);
  });

  it('違反: accept 前は pending', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines());
    capture({ chapterAbsPath: chapterPath, targetRoot: root, anchor: '1. 予約の受付', source: { kind: 'no-source', reason: 'x' }, by: 'agent:writer', sourceIndex: null });
    const { report } = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /pending/);
  });

  it('違反: 正本が消えたら source-missing', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines());
    const reqPath = writeDoc(root, 'requirements.md', requirementsDoc());
    const sourceIndex1 = buildSourceIndex(root, join(root, 'docs'));
    capture({ chapterAbsPath: chapterPath, targetRoot: root, anchor: '1. 予約の受付', source: { kind: 'from', id: 'reservation-flow/REQ-114' }, by: 'agent:writer', sourceIndex: sourceIndex1 });
    accept({ chapterAbsPath: chapterPath, chapterRelPath: 'docs/delivery/02-reservation.md', target: { kind: 'all' }, by: 'reviewer@example.com', sourceIndex: sourceIndex1 });

    rmSync(reqPath);
    const { report } = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /source-missing/);
  });

  it('警告のみ (既定): needs-recompute は normalizationVersion が古いエントリ、--strict-normalization で Violation', () => {
    const root = makeRoot();
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLines());
    writeFileSync(
      sidecarPathFor(chapterPath),
      JSON.stringify({
        sourceDoc: 'docs/delivery/02-reservation.md',
        entries: [
          {
            anchor: '1. 予約の受付', from: null, reason: 'x', blockFingerprint: 'sha256:bogus',
            capturedBy: 'agent:writer', capturedAt: '2026-09-28',
            acceptedBy: 'reviewer@example.com', acceptedAt: '2026-09-28', normalizationVersion: 0,
          },
        ],
      }),
    );
    const warned = runCheck(root);
    assert.equal(warned.report.exitCode, ExitCode.Ok, warned.report.format());
    assert.match(warned.warnings.join('\n'), /needs-recompute/);

    const strict = runCheck(root, { strictNormalization: true });
    assert.equal(strict.report.exitCode, ExitCode.Violation, strict.report.format());
    assert.match(strict.report.format(), /needs-recompute/);
  });

  it('違反: open-stated-as-final (章が確定を主張しているが正本が未決)', () => {
    const root = makeRoot();
    const chapterLinesFixed = [
      '---', 'id: chapter-1', 'kind: delivery-chapter', 'status: fixed', 'depends_on: []', '---', '',
      '# 章', '', '> **TL;DR**: テスト。', '',
      '## 1. 予約の受付', '', '予約は 30 日前まで受け付ける。', '',
    ];
    const chapterPath = writeDoc(root, 'delivery/02-reservation.md', chapterLinesFixed);
    writeDoc(root, 'requirements.md', requirementsDoc('予約は 30 日前まで受け付ける', 'draft'));
    const sourceIndex1 = buildSourceIndex(root, join(root, 'docs'));
    capture({ chapterAbsPath: chapterPath, targetRoot: root, anchor: '1. 予約の受付', source: { kind: 'from', id: 'reservation-flow/REQ-114' }, by: 'agent:writer', sourceIndex: sourceIndex1 });
    accept({ chapterAbsPath: chapterPath, chapterRelPath: 'docs/delivery/02-reservation.md', target: { kind: 'all' }, by: 'reviewer@example.com', sourceIndex: sourceIndex1 });

    const { report } = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /open-stated-as-final/);
  });

  it('正例: sidecar が 1 つも無い既存案件では何も赤くならない (opt-in)', () => {
    const root = makeRoot();
    writeDoc(root, 'delivery/02-reservation.md', chapterLines());
    const { report } = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('正例: delivery-chapter 以外の文書は対象にならない', () => {
    const root = makeRoot();
    writeDoc(root, 'requirements.md', requirementsDoc());
    const { report } = runCheck(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });
});
