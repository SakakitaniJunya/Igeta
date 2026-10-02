// node --test dist/generators/ContextFilesModule.test.js
// 新しい構成 (docs/person・ai・client) の読む範囲 (テスト仕様 04 の B6) の行は、`[TST-nnn]` で始まる名前の it が持つ。
// それ以外は旧い構成 (person・ai・client が無い) の検査で、いままでと変えない。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ContextFilesModule } from './ContextFilesModule.js';
import { ContextSizeModule } from './ContextSizeModule.js';

const workspaces: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-ctxfiles-'));
  workspaces.push(root);
  return root;
}

function writeDoc(root: string, relPath: string, lines: readonly string[]): void {
  const target = join(root, 'docs', relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${lines.join('\n')}\n`);
}

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('ContextFilesModule', () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
    writeDoc(root, '00-map.md', ['---', 'id: map', 'kind: map', 'depends_on: []', '---', '', '# 地図']);
    writeDoc(root, 'architecture/glossary.md', ['---', 'id: glossary', 'kind: glossary', 'depends_on: []', '---', '', '# 用語集']);
    writeDoc(root, 'guides/03-human-review.md', ['---', 'id: human-review', 'kind: human-review', 'depends_on: []', '---', '', '# 手引き']);
    writeDoc(root, 'contexts/reservation/requirements.md', [
      '---', 'id: reservation-requirements', 'kind: requirements', 'context: reservation', 'depends_on: []', '---', '',
      '# 予約要件', '', '[決済の約束](../payment/contract.md) を参照する。',
    ]);
    writeDoc(root, 'contexts/payment/contract.md', [
      '---', 'id: payment-contract', 'kind: context-contract', 'context: payment', 'depends_on: []', '---', '',
      '# 決済まとまりの約束',
    ]);
    writeDoc(root, 'contexts/payment/requirements.md', [
      '---', 'id: payment-requirements', 'kind: requirements', 'context: payment', 'depends_on: []', '---', '',
      '# 決済要件 (見えてはいけない内部文書)',
    ]);
  });

  it('正常系: 自分の文書 + 隣の context-contract + 既定共有 (map/glossary) だけを出す', () => {
    const result = new ContextFilesModule({ targetRoot: root }).analyze('reservation', false);
    assert.equal(result.error, null);
    assert.ok(result.files.some((f) => f.endsWith('contexts/reservation/requirements.md')));
    assert.ok(result.files.some((f) => f.endsWith('contexts/payment/contract.md')));
    assert.ok(result.files.some((f) => f.endsWith('00-map.md')));
    assert.ok(result.files.some((f) => f.endsWith('architecture/glossary.md')));
    // 既定では human-review (map/glossary 以外の共有 kind) は出さない
    assert.ok(!result.files.some((f) => f.endsWith('guides/03-human-review.md')), result.files.join(','));
    // 相手のまとまりの内部文書 (contract 以外) は出さない
    assert.ok(!result.files.some((f) => f.endsWith('contexts/payment/requirements.md')), result.files.join(','));
  });

  it('--with-shared: 共有文書を全部出す', () => {
    const result = new ContextFilesModule({ targetRoot: root }).analyze('reservation', true);
    assert.ok(result.files.some((f) => f.endsWith('guides/03-human-review.md')));
  });

  it('検査不能: 存在しないまとまり', () => {
    const result = new ContextFilesModule({ targetRoot: root }).analyze('nonexistent', false);
    assert.equal(result.files.length, 0);
    assert.equal(result.error?.severity, 'cannot-check');
  });

  it('検査不能: docs が無い', () => {
    const empty = makeRoot();
    const result = new ContextFilesModule({ targetRoot: empty }).analyze('reservation', false);
    assert.equal(result.error?.severity, 'cannot-check');
  });
});

/** 新しい構成の文書 1 本。frontmatter の id・kind と、足したい行 (context・depends_on) と、本文の行 */
function v4Doc(root: string, relPath: string, id: string, kind: string, extra: readonly string[] = [], body: readonly string[] = []): void {
  writeDoc(root, relPath, ['---', `id: ${id}`, `kind: ${kind}`, ...extra, '---', '', `# ${id}`, '', ...body]);
}

/** まとまり reservation (A)・payment (B) と全体共通 (shared)、読む範囲の外の文書 (ADR・手引き・提出物・実装タスク・README.md) を持つ構成 */
function writeV4Tree(root: string): void {
  v4Doc(root, 'person/requirements/01-requirements.md', 'requirements', 'requirements');
  v4Doc(root, 'person/design/shared/00-map.md', 'map', 'map');
  v4Doc(root, 'person/design/shared/01-function-list.md', 'function-list', 'function-list');
  v4Doc(root, 'person/design/reservation/00-map.md', 'reservation-map', 'context-map', ['context: reservation']);
  v4Doc(root, 'person/design/reservation/flows/01-booking.md', 'reservation-booking', 'business-flow', ['context: reservation']);
  v4Doc(root, 'person/design/payment/00-map.md', 'payment-map', 'context-map', ['context: payment']);
  v4Doc(root, 'person/design/payment/flows/01-refund.md', 'payment-refund', 'business-flow', ['context: payment']);
  v4Doc(root, 'ai/specs/shared/01-crosscutting.md', 'crosscutting', 'crosscutting');
  v4Doc(root, 'ai/specs/reservation/contract.md', 'reservation-contract', 'context-contract', ['context: reservation']);
  // A の文書は B の約束を参照する。B の約束は、A の読む範囲に入る。まとまりはフォルダ名から導く (B1) ので、frontmatter に context を書かない
  v4Doc(root, 'ai/specs/reservation/api/01-reserve.md', 'reservation-api', 'api-spec', ['depends_on: [payment-contract]']);
  v4Doc(root, 'ai/specs/payment/contract.md', 'payment-contract', 'context-contract', ['context: payment']);
  v4Doc(root, 'ai/specs/payment/api/01-pay.md', 'payment-api', 'api-spec', ['context: payment']);
  // 読む範囲の外
  v4Doc(root, 'person/decisions/2026/0001-x.md', 'adr-0001-x', 'adr');
  v4Doc(root, 'ai/handbook/how-to/01-setup.md', 'setup', 'guide');
  v4Doc(root, 'ai/specs/tasks/01-first.md', 'first-task', 'tasks', ['context: reservation']);
  v4Doc(root, 'client/delivery/spec-v1/01-overview.md', 'delivery-overview', 'delivery-chapter');
  for (const readme of ['person/design/reservation/README.md', 'ai/specs/README.md', 'person/requirements/README.md']) {
    writeDoc(root, readme, ['# 索引']);
  }
}

describe('新しい構成 (docs/person・ai・client) の context-files・context-size', () => {
  it('[TST-110] context-files A は B6 の範囲だけをパスの順で返し (--with-shared の有無で変わらない)、context-size A は同じ範囲を数える', () => {
    const root = makeRoot();
    writeV4Tree(root);
    // B の文書・ADR・手引き・提出物・実装タスク・README.md は含まない。A の文書が参照する B の約束は含む
    const expected = [
      'docs/ai/specs/payment/contract.md',
      'docs/ai/specs/reservation/api/01-reserve.md',
      'docs/ai/specs/reservation/contract.md',
      'docs/ai/specs/shared/01-crosscutting.md',
      'docs/person/design/reservation/00-map.md',
      'docs/person/design/reservation/flows/01-booking.md',
      'docs/person/design/shared/00-map.md',
      'docs/person/design/shared/01-function-list.md',
      'docs/person/requirements/01-requirements.md',
    ];
    const files = new ContextFilesModule({ targetRoot: root });
    for (const withShared of [false, true]) {
      const result = files.analyze('reservation', withShared);
      assert.equal(result.error, null, `--with-shared=${withShared}`);
      assert.deepEqual(result.files, expected, `--with-shared=${withShared}`);
    }

    const size = new ContextSizeModule({ targetRoot: root }).analyze('reservation');
    assert.deepEqual(size.violations, []);
    const entry = size.entries[0];
    assert.deepEqual(entry?.files.map((file) => file.relPath).sort(), expected);
    // 行数は、ファイルの行数 (末尾の改行は数えない) の合計
    const lines = (relPath: string): number => readFileSync(join(root, relPath), 'utf8').split('\n').length - 1;
    assert.equal(entry?.totalLines, expected.reduce((sum, relPath) => sum + lines(relPath), 0));
    // context-size を引数なしで呼ぶと、まとまりの一覧 (shared を除く)
    assert.deepEqual(new ContextSizeModule({ targetRoot: root }).analyze().entries.map((e) => e.context), ['payment', 'reservation']);
  });

  it('[TST-311] どこにもフォルダが無いまとまりを指定すると検査不能', () => {
    const root = makeRoot();
    writeV4Tree(root);
    const result = new ContextFilesModule({ targetRoot: root }).analyze('nothing', false);
    assert.deepEqual(result.files, []);
    assert.equal(result.error?.severity, 'cannot-check');
    assert.match(result.error?.message ?? '', /まとまりが存在しない: nothing/);
  });
});
