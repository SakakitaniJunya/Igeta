// node --test dist/generators/ContextSizeModule.test.js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ContextSizeModule } from './ContextSizeModule.js';

const workspaces: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'yatsu-ctxsize-'));
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

describe('ContextSizeModule', () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
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
      '# 決済要件 (reservation からは見えない内部文書)',
    ]);
  });

  it('正常系: 自分の文書 + 参照している隣の context-contract の総行数を出す (内部文書は含めない)', () => {
    const result = new ContextSizeModule({ targetRoot: root }).analyze('reservation');
    assert.equal(result.violations.length, 0, JSON.stringify(result));
    const entry = result.entries[0];
    assert.ok(entry, JSON.stringify(result));
    const relPaths = entry.files.map((f) => f.relPath);
    assert.ok(relPaths.some((p) => p.endsWith('contexts/reservation/requirements.md')), relPaths.join(','));
    assert.ok(relPaths.some((p) => p.endsWith('contexts/payment/contract.md')), relPaths.join(','));
    assert.ok(!relPaths.some((p) => p.endsWith('contexts/payment/requirements.md')), relPaths.join(','));
    assert.equal(entry.totalLines, entry.files.reduce((s, f) => s + f.lines, 0));
  });

  it('引数なし: 全部のまとまりを一覧する', () => {
    const result = new ContextSizeModule({ targetRoot: root }).analyze();
    const contexts = result.entries.map((e) => e.context).sort();
    assert.deepEqual(contexts, ['payment', 'reservation']);
  });

  it('違反: contextSizeLimit を超えたら Violation', () => {
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ contextSizeLimit: 1 }));
    const result = new ContextSizeModule({ targetRoot: root }).analyze('reservation');
    assert.equal(result.violations.length, 1, JSON.stringify(result));
    assert.match(result.violations[0]?.message ?? '', /行数上限 \(1\) を超えている/);
  });

  it('検査不能: 存在しないまとまりを指定した', () => {
    const result = new ContextSizeModule({ targetRoot: root }).analyze('nonexistent');
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]?.severity, 'cannot-check');
  });

  it('検査不能: docs が無い', () => {
    const empty = makeRoot();
    const result = new ContextSizeModule({ targetRoot: empty }).analyze();
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]?.severity, 'cannot-check');
  });
});
