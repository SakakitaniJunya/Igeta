// node --test dist/checks/ContextBoundaryCheck.test.js
// 新しい構成 (docs/person・ai・client) のまとまりの境界 (テスト仕様 04 の B1〜B5) の行は、`[TST-nnn]` で始まる名前の it が持つ。
// それ以外は旧い構成 (person・ai・client が無い) の検査で、いままでと変えない。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExitCode } from '../core/ExitCode.js';
import { DEFAULT_SHARED_KINDS } from '../core/IgetaConfig.js';
import { Report } from '../core/Report.js';
import type { Violation } from '../core/Report.js';
import { ContextBoundaryCheck } from './ContextBoundaryCheck.js';

const workspaces: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-ctxboundary-'));
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

/** 新しい構成の文書 1 本。frontmatter の id・kind と、足したい行 (context・depends_on) と、本文の行 */
function v4Doc(root: string, relPath: string, id: string, kind: string, extra: readonly string[] = [], body: readonly string[] = []): void {
  writeDoc(root, relPath, ['---', `id: ${id}`, `kind: ${kind}`, ...extra, '---', '', `# ${id}`, '', ...body]);
}

/** まとまり reservation (A)・payment (B) と全体共通 (shared) を持つ、参照の無い正しい構成 */
function writeV4Tree(root: string): void {
  v4Doc(root, 'person/design/shared/00-map.md', 'map', 'map');
  v4Doc(root, 'person/design/shared/01-function-list.md', 'function-list', 'function-list');
  v4Doc(root, 'person/design/shared/03-nonfunctional.md', 'nonfunctional', 'nonfunctional');
  v4Doc(root, 'person/design/reservation/00-map.md', 'reservation-map', 'context-map', ['context: reservation']);
  v4Doc(root, 'person/design/reservation/flows/01-booking.md', 'reservation-booking', 'business-flow', ['context: reservation']);
  v4Doc(root, 'person/design/payment/00-map.md', 'payment-map', 'context-map', ['context: payment']);
  v4Doc(root, 'person/design/payment/flows/01-refund.md', 'payment-refund', 'business-flow', ['context: payment']);
  v4Doc(root, 'person/requirements/01-requirements.md', 'requirements', 'requirements');
  v4Doc(root, 'ai/specs/shared/01-crosscutting.md', 'crosscutting', 'crosscutting');
  v4Doc(root, 'ai/specs/reservation/contract.md', 'reservation-contract', 'context-contract', ['context: reservation']);
  v4Doc(root, 'ai/specs/payment/contract.md', 'payment-contract', 'context-contract', ['context: payment']);
  v4Doc(root, 'ai/specs/reservation/api/01-reserve.md', 'reservation-api', 'api-spec', ['context: reservation']);
  v4Doc(root, 'ai/specs/payment/api/01-pay.md', 'payment-api', 'api-spec', ['context: payment']);
  v4Doc(root, 'person/decisions/2026/0001-x.md', 'adr-0001-x', 'adr');
  v4Doc(root, 'ai/handbook/how-to/01-setup.md', 'setup', 'guide');
  v4Doc(root, 'client/delivery/spec-v1/01-overview.md', 'delivery-overview', 'delivery-chapter');
}

/** 1 文書の depends_on の行 (1 始まり)。違反の行は、この行 */
const dependsOnLine = (root: string, relPath: string): number =>
  readFileSync(join(root, 'docs', relPath), 'utf8').split('\n').findIndex((line) => line.startsWith('depends_on:')) + 1;

/** まとまりの境界を越える参照 3 通り (TST-309)。どれも 1 件の違反になる */
const CROSSINGS: ReadonlyArray<{
  readonly name: string;
  readonly path: string;
  readonly id: string;
  readonly kind: string;
  readonly extra: readonly string[];
  readonly message: RegExp;
}> = [
  {
    name: 'A の文書が B の業務フローを指す',
    path: 'person/design/reservation/flows/01-booking.md',
    id: 'reservation-booking',
    kind: 'business-flow',
    extra: ['context: reservation', 'depends_on: [payment-refund]'],
    message: /別のまとまり \(payment\) の文書を直接参照している: docs[\\/]person[\\/]design[\\/]payment[\\/]flows[\\/]01-refund\.md/,
  },
  {
    name: 'shared の非機能が A の文書を指す',
    path: 'person/design/shared/03-nonfunctional.md',
    id: 'nonfunctional',
    kind: 'nonfunctional',
    extra: ['depends_on: [reservation-booking]'],
    message: /shared の文書が、特定のまとまり \(reservation\) の文書を直接参照している: docs[\\/]person[\\/]design[\\/]reservation[\\/]flows[\\/]01-booking\.md/,
  },
  {
    name: 'A の文書が B の約束でない ai/specs/B/ の文書を指す',
    path: 'ai/specs/reservation/api/01-reserve.md',
    id: 'reservation-api',
    kind: 'api-spec',
    extra: ['context: reservation', 'depends_on: [payment-api]'],
    message: /別のまとまり \(payment\) の文書を直接参照している: docs[\\/]ai[\\/]specs[\\/]payment[\\/]api[\\/]01-pay\.md/,
  },
];

describe('ContextBoundaryCheck: 新しい構成 (docs/person・ai・client)', () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
    writeV4Tree(root);
  });

  it('[TST-109] A の文書が B の約束を・A の地図が B の地図を・shared の機能一覧が A の文書を参照し、ADR・手引きは境界の外で、context: A の要件は A の文書を参照できる (違反も未割り当ての警告も無い)', () => {
    // A の文書 → B の約束 (と、shared の文書)。まとまりはフォルダ名から導く (B1) ので、この文書は frontmatter に context を書かない
    v4Doc(root, 'ai/specs/reservation/api/01-reserve.md', 'reservation-api', 'api-spec', ['depends_on: [payment-contract, crosscutting]']);
    // A の地図 → B の地図
    v4Doc(root, 'person/design/reservation/00-map.md', 'reservation-map', 'context-map', ['context: reservation'], ['[決済の地図](../payment/00-map.md)']);
    // shared の機能一覧 → A の文書 (本文のリンクと修飾 ID)
    v4Doc(root, 'person/design/shared/01-function-list.md', 'function-list', 'function-list', [], [
      '[予約の流れ](../reservation/flows/01-booking.md)',
      '',
      'payment-refund/BF-001 も見る。',
    ]);
    // ADR と手引きは、A・B のどちらも参照してよい (境界の検査に掛けない)
    v4Doc(root, 'person/decisions/2026/0001-x.md', 'adr-0001-x', 'adr', ['depends_on: [reservation-booking, payment-refund]']);
    v4Doc(root, 'ai/handbook/how-to/01-setup.md', 'setup', 'guide', [], [
      '[予約](../../../person/design/reservation/flows/01-booking.md)',
      '[決済](../../../person/design/payment/flows/01-refund.md)',
    ]);
    // context: A と書いた要件の文書は A の文書を参照できる (階層の無い場所は frontmatter の context)
    v4Doc(root, 'person/requirements/02-reservation.md', 'reservation-requirements', 'requirements', ['context: reservation'], [
      '[予約の流れ](../design/reservation/flows/01-booking.md)',
    ]);
    const { report, warnings } = run(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.deepEqual(warnings, []);
  });

  it('[TST-309] A の文書が B の業務フロー・B の約束でない ai/specs/B/ の文書を指す・shared の非機能が A の文書を指すと違反', () => {
    for (const { name, path, id, kind, extra, message } of CROSSINGS) {
      const target = makeRoot();
      writeV4Tree(target);
      v4Doc(target, path, id, kind, extra);
      const { violations } = run(target);
      assert.equal(violations.length, 1, name);
      assert.equal((violations[0]?.file ?? '').split('\\').join('/'), `docs/${path}`, name);
      assert.equal(violations[0]?.line, dependsOnLine(target, path), name);
      assert.match(violations[0]?.message ?? '', message, name);
    }
  });

  it('[TST-310] sharedKinds に kind を足しても、境界の違反は変わらず、警告が 1 件出る', () => {
    for (const { name, path, id, kind, extra, message } of CROSSINGS) {
      const target = makeRoot();
      writeV4Tree(target);
      v4Doc(target, path, id, kind, extra);
      writeFileSync(join(target, '.igeta.json'), JSON.stringify({ sharedKinds: [...DEFAULT_SHARED_KINDS, 'nonfunctional', 'business-flow', 'api-spec'] }));
      const { violations, warnings } = run(target);
      assert.equal(violations.length, 1, name);
      assert.match(violations[0]?.message ?? '', message, name);
      assert.equal(warnings.length, 1, `${name}: ${warnings.join(' / ')}`);
      assert.match(warnings[0] ?? '', /sharedKinds/, name);
    }
  });
});
