// node --test dist/generators/DiscrepancyModule.test.js
// 食い違いログの追記と集計を、モジュールを直接呼んで確かめる。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DISCREPANCY_FILENAME, discrepancyLogPathFor, readDiscrepancyLog } from '../core/DiscrepancyLog.js';
import { addDiscrepancy, buildDiscrepancyReport } from './DiscrepancyModule.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-discrepancy-'));
  workspaces.push(root);
  return root;
}

function write(root: string, rel: string, content: string): string {
  const target = join(root, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

const SUBMISSION = 'docs/delivery/design-document';
const CHAPTER = `${SUBMISSION}/01-reservation.md`;

/** 提出物のディレクトリと、その中の章 1 本を作る。 */
function setup(): { root: string; submissionDir: string } {
  const root = makeRoot();
  write(root, CHAPTER, '# 章\n\n## 1. 予約の受付\n\n本文。\n');
  return { root, submissionDir: join(root, SUBMISSION) };
}

describe('addDiscrepancy', () => {
  it('1 行追記し、未指定の項目は null で書く', () => {
    const { root, submissionDir } = setup();
    const result = addDiscrepancy({
      submissionDir,
      location: 'docs/delivery/design-document/01-reservation.md#1.予約の受付',
      category: 'scope-overstatement',
      sourceId: 'reservation-flow/REQ-114',
      fixedInCommit: 'a1b2c3d',
      targetRoot: root,
      now: new Date('2026-09-30T12:00:00Z'),
    });
    assert.equal(result.kind, 'ok', JSON.stringify(result));
    assert.equal(result.path, discrepancyLogPathFor(submissionDir));
    const lines = readFileSync(discrepancyLogPathFor(submissionDir), 'utf8').split('\n').filter((l) => l !== '');
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0] ?? ''), {
      date: '2026-09-30',
      location: 'docs/delivery/design-document/01-reservation.md#1.予約の受付',
      sourceId: 'reservation-flow/REQ-114',
      category: 'scope-overstatement',
      caughtBy: null,
      fixedInCommit: 'a1b2c3d',
    });
    // 2 件目は追記で増える
    const second = addDiscrepancy({
      submissionDir,
      location: 'docs/delivery/design-document/01-reservation.md',
      category: 'mermaid-unrenderable',
      caughtBy: 'mermaid-check',
      targetRoot: root,
    });
    assert.equal(second.kind, 'ok', JSON.stringify(second));
    const log = readDiscrepancyLog(submissionDir);
    assert.equal(log.kind, 'ok');
    if (log.kind !== 'ok') return;
    assert.equal(log.entries.length, 2);
    assert.equal(log.entries[1]?.sourceId, null);
    assert.equal(log.entries[1]?.caughtBy, 'mermaid-check');
  });

  it('違反: category が閉集合に無いと有効値を全部出して拒否する', () => {
    const { root, submissionDir } = setup();
    const result = addDiscrepancy({
      submissionDir,
      location: CHAPTER,
      category: 'scope-overstatment', // 綴り違い
      targetRoot: root,
    });
    assert.equal(result.kind, 'rejected');
    if (result.kind !== 'rejected') return;
    assert.equal(result.violation.severity, 'violation');
    for (const valid of ['scope-overstatement', 'open-stated-as-final', 'missing-confirmation-item', 'stale-copy-across-sources', 'mermaid-unrenderable']) {
      assert.match(result.violation.message, new RegExp(valid));
    }
    // 拒否されたのでログは作られない
    assert.equal(readDiscrepancyLog(submissionDir).kind, 'absent');
  });

  it('違反: location のパス部が実在しない', () => {
    const { root, submissionDir } = setup();
    const result = addDiscrepancy({
      submissionDir,
      location: 'docs/delivery/design-document/99-missing.md#節',
      category: 'scope-overstatement',
      targetRoot: root,
    });
    assert.equal(result.kind, 'rejected');
    if (result.kind !== 'rejected') return;
    assert.equal(result.violation.severity, 'violation');
    assert.match(result.violation.message, /99-missing\.md/);
  });

  it('検査不能: 提出物のディレクトリが無い', () => {
    const root = makeRoot();
    const result = addDiscrepancy({
      submissionDir: join(root, 'docs/delivery/none'),
      location: CHAPTER,
      category: 'scope-overstatement',
      targetRoot: root,
    });
    assert.equal(result.kind, 'rejected');
    if (result.kind !== 'rejected') return;
    assert.equal(result.violation.severity, 'cannot-check');
  });

  it('検査不能: 末尾が改行で終わっていないログには追記しない', () => {
    const { root, submissionDir } = setup();
    writeFileSync(discrepancyLogPathFor(submissionDir), '{"date":"2026-09-30"'); // 途中で切れた行
    const result = addDiscrepancy({
      submissionDir,
      location: CHAPTER,
      category: 'scope-overstatement',
      targetRoot: root,
    });
    assert.equal(result.kind, 'rejected');
    if (result.kind !== 'rejected') return;
    assert.equal(result.violation.severity, 'cannot-check');
    assert.match(result.violation.message, /改行で終わっていない/);
  });
});

describe('buildDiscrepancyReport', () => {
  /** 提出物のディレクトリにログを書くヘルパ。 */
  function appendLines(root: string, relDir: string, lines: readonly string[]): void {
    const dir = join(root, relDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, DISCREPANCY_FILENAME), `${lines.join('\n')}\n`);
  }

  it('category ごとの件数と事前捕捉 (caughtBy 非 null) を数える', () => {
    const { root } = setup();
    appendLines(root, SUBMISSION, [
      '{"date":"2026-09-30","location":"a.md#1","sourceId":null,"category":"scope-overstatement","caughtBy":null,"fixedInCommit":null}',
      '{"date":"2026-09-30","location":"a.md#2","sourceId":null,"category":"scope-overstatement","caughtBy":"provenance-check","fixedInCommit":null}',
      '{"date":"2026-09-30","location":"b.md","sourceId":null,"category":"mermaid-unrenderable","caughtBy":"mermaid-check","fixedInCommit":null}',
    ]);
    // 2 つ目の提出物にもログがあると全部拾う
    appendLines(root, 'docs/delivery/operation-manual', [
      '{"date":"2026-09-30","location":"c.md","sourceId":null,"category":"scope-overstatement","caughtBy":null,"fixedInCommit":null}',
    ]);
    const result = buildDiscrepancyReport({ targetRoot: root, docsDir: join(root, 'docs') });
    assert.equal(result.kind, 'ok', JSON.stringify(result));
    if (result.kind !== 'ok') return;
    assert.equal(result.files, 2);
    assert.deepEqual(result.rows, [
      { category: 'scope-overstatement', count: 3, caught: 1 },
      { category: 'mermaid-unrenderable', count: 1, caught: 1 },
    ]);
    assert.deepEqual(result.total, { count: 4, caught: 2 });
  });

  it('--dir 指定時はその提出物のログだけを見る', () => {
    const { root, submissionDir } = setup();
    appendLines(root, SUBMISSION, [
      '{"date":"2026-09-30","location":"a.md","sourceId":null,"category":"scope-overstatement","caughtBy":null,"fixedInCommit":null}',
    ]);
    appendLines(root, 'docs/delivery/operation-manual', [
      '{"date":"2026-09-30","location":"c.md","sourceId":null,"category":"mermaid-unrenderable","caughtBy":null,"fixedInCommit":null}',
    ]);
    const result = buildDiscrepancyReport({ targetRoot: root, docsDir: join(root, 'docs'), submissionDir });
    assert.equal(result.kind, 'ok', JSON.stringify(result));
    if (result.kind !== 'ok') return;
    assert.equal(result.files, 1);
    assert.deepEqual(result.total, { count: 1, caught: 0 });
  });

  it('node_modules / ドット始まりのディレクトリのログは拾わない', () => {
    const { root } = setup();
    appendLines(root, 'docs/node_modules/packed', [
      '{"date":"2026-09-30","location":"a.md","sourceId":null,"category":"scope-overstatement","caughtBy":null,"fixedInCommit":null}',
    ]);
    appendLines(root, 'docs/.hidden/sub', [
      '{"date":"2026-09-30","location":"a.md","sourceId":null,"category":"scope-overstatement","caughtBy":null,"fixedInCommit":null}',
    ]);
    const result = buildDiscrepancyReport({ targetRoot: root, docsDir: join(root, 'docs') });
    assert.equal(result.kind, 'ok', JSON.stringify(result));
    if (result.kind !== 'ok') return;
    assert.equal(result.files, 0);
  });

  it('検査不能: 壊れた行は黙って読み飛ばさない', () => {
    const { root } = setup();
    appendLines(root, SUBMISSION, [
      '{"date":"2026-09-30","location":"a.md","sourceId":null,"category":"scope-overstatement","caughtBy":null,"fixedInCommit":null}',
      '{"date":', // 壊れた行
    ]);
    const result = buildDiscrepancyReport({ targetRoot: root, docsDir: join(root, 'docs') });
    assert.equal(result.kind, 'rejected');
    if (result.kind !== 'rejected') return;
    assert.equal(result.violation.severity, 'cannot-check');
    assert.match(result.violation.message, /JSON が壊れている/);
  });

  it('検査不能: category が閉集合に無い行は壊れた行として扱う', () => {
    const { root } = setup();
    appendLines(root, SUBMISSION, [
      '{"date":"2026-09-30","location":"a.md","sourceId":null,"category":"typo-category","caughtBy":null,"fixedInCommit":null}',
    ]);
    const result = buildDiscrepancyReport({ targetRoot: root, docsDir: join(root, 'docs') });
    assert.equal(result.kind, 'rejected');
    if (result.kind !== 'rejected') return;
    assert.equal(result.violation.severity, 'cannot-check');
    assert.match(result.violation.message, /typo-category/);
  });

  it('ログが 1 つも無ければ files: 0 の ok (CLI 側が OK で終わらせる)', () => {
    const root = makeRoot();
    const result = buildDiscrepancyReport({ targetRoot: root, docsDir: join(root, 'docs') });
    assert.equal(result.kind, 'ok', JSON.stringify(result));
    if (result.kind !== 'ok') return;
    assert.equal(result.files, 0);
    assert.deepEqual(result.total, { count: 0, caught: 0 });
  });
});
