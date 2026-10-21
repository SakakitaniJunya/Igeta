/** check-layout の自己テスト。置き場の違反 (本体が多い・接頭辞の共有・utils) が落ち、許される形は落ちない。 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { findLayoutViolations } from '../check-layout.js';

const roots = [];

function createTree(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'igeta-layout-'));
  roots.push(root);
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '');
  }

  return root;
}

after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('MD-11 置き場の検査', () => {
  it('MD-11 本体が 8 本ある folder は落ちる', () => {
    const root = createTree(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts', 'h.ts']);

    const violations = findLayoutViolations(root);

    assert.equal(violations.filter((message) => message.includes('本体が 8 本')).length, 1);
  });

  it('MD-11 本体が 7 本の folder は落ちない', () => {
    const root = createTree(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts']);

    assert.deepEqual(findLayoutViolations(root), []);
  });

  it('MD-11 接頭辞を 3 本が共有する folder は落ちる', () => {
    const root = createTree(['contract-rows.ts', 'contract-types.ts', 'contract-failure.ts', 'other.ts']);

    const violations = findLayoutViolations(root);

    assert.equal(violations.filter((message) => message.includes('接頭辞 contract を 3 本')).length, 1);
  });

  it('MD-11 接頭辞の共有が 2 本までなら落ちない', () => {
    const root = createTree(['in-memory-store.ts', 'in-memory-runner.ts', 'other.ts']);

    assert.deepEqual(findLayoutViolations(root), []);
  });

  it('MD-11 utils という folder は落ちる', () => {
    const root = createTree(['utils/format.ts', 'a.ts']);

    const violations = findLayoutViolations(root);

    assert.equal(violations.filter((message) => message.includes('utils は作らない')).length, 1);
  });

  it('MD-11 spec は本体に数えず、index.ts は接頭辞に数えない', () => {
    const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'a.spec.ts', 'b.spec.ts', 'c.test.ts', 'index.ts'];
    const root = createTree(files);

    assert.deepEqual(findLayoutViolations(root), []);
  });

  it('MD-11 深い folder の違反も見つける', () => {
    const root = createTree(['outer/inner/x-a.ts', 'outer/inner/x-b.ts', 'outer/inner/x-c.ts']);

    const violations = findLayoutViolations(root);

    assert.equal(violations.length, 1);
  });
});
