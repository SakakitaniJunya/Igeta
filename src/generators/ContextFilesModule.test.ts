// node --test dist/generators/ContextFilesModule.test.js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ContextFilesModule } from './ContextFilesModule.js';

const workspaces: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'yatsu-ctxfiles-'));
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
