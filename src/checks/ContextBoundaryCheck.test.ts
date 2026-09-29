// node --test dist/checks/ContextBoundaryCheck.test.js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExitCode } from '../core/ExitCode.js';
import { Report } from '../core/Report.js';
import type { Violation } from '../core/Report.js';
import { ContextBoundaryCheck } from './ContextBoundaryCheck.js';

const workspaces: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'yatsu-ctxboundary-'));
  workspaces.push(root);
  return root;
}

function writeDoc(root: string, relPath: string, lines: readonly string[]): void {
  const target = join(root, 'docs', relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${lines.join('\n')}\n`);
}

function run(root: string): { report: Report; violations: readonly Violation[]; warnings: readonly string[] } {
  const check = new ContextBoundaryCheck();
  const violations = check.run({ targetRoot: root, igetaRoot: root });
  const report = new Report();
  report.addAll(violations);
  return { report, violations, warnings: check.warnings };
}

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('ContextBoundaryCheck', () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });

  it('正例: context 未記入 (shared) の既存文書同士は境界検査に引っかからない', () => {
    writeDoc(root, 'product/requirements.md', [
      '---', 'id: requirements', 'kind: requirements', 'depends_on: []', '---', '',
      '# 要件定義書', '', '[機能一覧](../design/basic/function-list.md) を参照。',
    ]);
    writeDoc(root, 'design/basic/function-list.md', [
      '---', 'id: function-list', 'kind: function-list', 'depends_on: [requirements]', '---', '',
      '# 機能一覧',
    ]);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('違反: 別のまとまりの内部文書を本文リンクで直接参照している', () => {
    writeDoc(root, 'contexts/reservation/requirements.md', [
      '---', 'id: reservation-requirements', 'kind: requirements', 'context: reservation', 'depends_on: []', '---', '',
      '# 予約要件', '', '[決済の内部要件](../payment/requirements.md) を直接参照する。',
    ]);
    writeDoc(root, 'contexts/payment/requirements.md', [
      '---', 'id: payment-requirements', 'kind: requirements', 'context: payment', 'depends_on: []', '---', '',
      '# 決済要件',
    ]);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /別のまとまり \(payment\) の文書を直接参照している: docs[\\/]contexts[\\/]payment[\\/]requirements\.md/);
  });

  it('正例: 相手のまとまりの context-contract 経由の参照は通す', () => {
    writeDoc(root, 'contexts/reservation/requirements.md', [
      '---', 'id: reservation-requirements', 'kind: requirements', 'context: reservation', 'depends_on: []', '---', '',
      '# 予約要件', '', '[決済の約束](../payment/contract.md) を参照する。',
    ]);
    writeDoc(root, 'contexts/payment/contract.md', [
      '---', 'id: payment-contract', 'kind: context-contract', 'context: payment', 'depends_on: []', '---', '',
      '# 決済まとまりの約束',
    ]);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('正例: 既定 allowlist の kind (glossary) は別まとまりから参照してよい', () => {
    writeDoc(root, 'contexts/reservation/requirements.md', [
      '---', 'id: reservation-requirements', 'kind: requirements', 'context: reservation', 'depends_on: []', '---', '',
      '# 予約要件', '', '[用語集](../../architecture/glossary.md) を参照する。',
    ]);
    writeDoc(root, 'architecture/glossary.md', [
      '---', 'id: glossary', 'kind: glossary', 'context: payment', 'depends_on: []', '---', '',
      '# 用語集',
    ]);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('正例: 参照先の kind が共有なら、参照先の context が無記入 (未割り当て) でも通す', () => {
    writeDoc(root, 'contexts/reservation/requirements.md', [
      '---', 'id: reservation-requirements', 'kind: requirements', 'context: reservation', 'depends_on: []', '---', '',
      '# 予約要件', '', '[用語集](../../architecture/glossary.md) を参照する。',
    ]);
    writeDoc(root, 'architecture/glossary.md', [
      '---', 'id: glossary', 'kind: glossary', 'depends_on: []', '---', '',
      '# 用語集',
    ]);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('違反: 参照先が未割り当て (context 無記入・共有 kind でもない) の文書を直接参照したら違反にする (code-reviewer round 2 blocker 1)', () => {
    writeDoc(root, 'contexts/reservation/requirements.md', [
      '---', 'id: reservation-requirements', 'kind: requirements', 'context: reservation', 'depends_on: []', '---', '',
      '# 予約要件', '', '[未割り当ての文書](../../product/other.md) を直接参照する。',
    ]);
    writeDoc(root, 'product/other.md', [
      '---', 'id: other', 'kind: requirements', 'depends_on: []', '---', '',
      '# 未割り当ての文書',
    ]);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /参照先が未割り当て.*docs[\\/]product[\\/]other\.md/);
  });

  it('正例: 全体の地図からまとまりの地図への参照は通す (地図の網羅と矛盾しない)', () => {
    writeDoc(root, '00-map.md', [
      '---', 'id: map', 'kind: map', 'depends_on: []', '---', '',
      '# 地図', '', '[予約まとまりの地図](./contexts/maps/reservation.md) を参照する。',
    ]);
    writeDoc(root, 'contexts/maps/reservation.md', [
      '---', 'id: reservation-map', 'kind: context-map', 'context: reservation', 'depends_on: []', '---', '',
      '# 予約まとまりの地図',
    ]);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('違反: 修飾 ID (<doc-id>/PREFIX-nnn) での直接参照も検出する', () => {
    writeDoc(root, 'contexts/reservation/requirements.md', [
      '---', 'id: reservation-requirements', 'kind: requirements', 'context: reservation', 'depends_on: []', '---', '',
      '# 予約要件', '', '決済の内部仕様は payment-requirements/REQ-001 を見る。',
    ]);
    writeDoc(root, 'contexts/payment/requirements.md', [
      '---', 'id: payment-requirements', 'kind: requirements', 'context: payment', 'depends_on: []', '---', '',
      '# 決済要件', '', '| REQ-001 | 内容 |',
    ]);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /別のまとまり \(payment\)/);
  });

  it('違反: 未割り当て (context 無記入・共有 kind でもない) の文書が別まとまりの内部を参照したら違反にする (code-reviewer round 1 non-blocking 2)', () => {
    // requirements は sharedKinds の既定に無い。context も無記入 (shared) なので、
    // 旧実装 (参照元が shared なら無条件で免除) だと検査を丸ごと免れてしまっていた。
    writeDoc(root, 'product/requirements.md', [
      '---', 'id: requirements', 'kind: requirements', 'depends_on: []', '---', '',
      '# 要件定義書', '', '[決済の内部要件](../contexts/payment/requirements.md) を直接参照する。',
    ]);
    writeDoc(root, 'contexts/payment/requirements.md', [
      '---', 'id: payment-requirements', 'kind: requirements', 'context: payment', 'depends_on: []', '---', '',
      '# 決済要件',
    ]);
    const { report, warnings } = run(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /別のまとまり \(payment\) の文書を直接参照している/);
    assert.match(warnings.join('\n'), /未割り当て.*1 件.*product[\\/]requirements\.md/);
  });

  it('正例: 未割り当ての文書同士 (どちらも context 無記入) は違反にしない。warnings に両方出す', () => {
    writeDoc(root, 'product/requirements.md', [
      '---', 'id: requirements', 'kind: requirements', 'depends_on: []', '---', '',
      '# 要件定義書', '', '[機能一覧](../design/function-list.md) を参照。',
    ]);
    writeDoc(root, 'design/function-list.md', [
      '---', 'id: function-list', 'kind: function-list', 'depends_on: []', '---', '',
      '# 機能一覧',
    ]);
    const { report, warnings } = run(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.match(warnings.join('\n'), /未割り当て.*2 件/);
  });

  it('違反: depends_on だけによる境界違反 (本文リンクが無くても検出する)', () => {
    writeDoc(root, 'contexts/reservation/requirements.md', [
      '---', 'id: reservation-requirements', 'kind: requirements', 'context: reservation',
      'depends_on: [payment-requirements]', '---', '',
      '# 予約要件',
    ]);
    writeDoc(root, 'contexts/payment/requirements.md', [
      '---', 'id: payment-requirements', 'kind: requirements', 'context: payment', 'depends_on: []', '---', '',
      '# 決済要件',
    ]);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /別のまとまり \(payment\)/);
  });

  it('違反: 「## 関連」節の依存も検査対象にする (他検査と違い除外しない)', () => {
    writeDoc(root, 'contexts/reservation/requirements.md', [
      '---', 'id: reservation-requirements', 'kind: requirements', 'context: reservation', 'depends_on: []', '---', '',
      '# 予約要件', '', '## 関連', '', '| 区分 | 文書 | 対応 ID |', '|---|---|---|',
      '| 上流 | [決済要件](../payment/requirements.md) | — |',
    ]);
    writeDoc(root, 'contexts/payment/requirements.md', [
      '---', 'id: payment-requirements', 'kind: requirements', 'context: payment', 'depends_on: []', '---', '',
      '# 決済要件',
    ]);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
  });

  it('検査不能: docs が無い', () => {
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
  });

  it('検査不能: .igeta.json の sharedKinds が配列でない', () => {
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ sharedKinds: 'glossary' }));
    writeDoc(root, 'product/requirements.md', ['---', 'id: requirements', 'kind: requirements', 'depends_on: []', '---', '', '# 要件定義書']);
    const { report } = run(root);
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
  });
});
