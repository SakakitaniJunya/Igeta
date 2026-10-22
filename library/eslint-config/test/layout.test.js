/** check-layout の自己テスト。置き場の違反 (本体が多い・接頭辞の共有・utils) が落ち、許される形は落ちない。 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findLayoutViolations } from '../check-layout.js';

const roots = [];
const CLI = fileURLToPath(new URL('../check-layout.js', import.meta.url));

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

  it('MD-11 CLI は違反があると終了コード 1、無いと 0 で終わる', () => {
    const violating = createTree(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts', 'h.ts']);
    const clean = createTree(['a.ts']);

    const violatingResult = spawnSync('node', [CLI, violating]);
    const cleanResult = spawnSync('node', [CLI, clean]);

    assert.equal(violatingResult.status, 1);
    assert.equal(cleanResult.status, 0);
  });

  it('MD-11 bin のリンク経由で呼んでも CLI が走り、違反で終了コード 1 になる', () => {
    const violating = createTree(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts', 'h.ts']);
    const linkRoot = createTree([]);
    const link = path.join(linkRoot, 'igeta-check-layout');
    symlinkSync(CLI, link);

    const result = spawnSync('node', [link, violating]);

    assert.equal(result.status, 1);
  });

  it('L5 shared は子が層と test-support、本体が index.ts だけなら落ちない', () => {
    const root = createTree(['shared/index.ts', 'shared/domain/a.ts', 'shared/infrastructure/a.ts', 'shared/presentation/a.ts', 'shared/test-support/a.ts']);

    assert.deepEqual(findLayoutViolations(root), []);
  });

  it('L5 rust の shared は mod.rs と層と test_support なら落ちない', () => {
    const root = createTree(['shared/mod.rs', 'shared/domain/mod.rs', 'shared/test_support/mod.rs', 'shared/test_support/emulator.rs']);

    assert.deepEqual(findLayoutViolations(root, { extensions: ['rs'] }), []);
  });

  it('L5 shared の直下に本体を置くと落ちる', () => {
    const root = createTree(['shared/index.ts', 'shared/helpers.ts', 'shared/domain/a.ts']);

    const violations = findLayoutViolations(root);

    assert.equal(violations.filter((message) => message.includes('置けない物: helpers.ts')).length, 1);
  });

  it('L5 shared の子に層以外の folder を置くと落ちる', () => {
    const root = createTree(['shared/misc/a.ts']);

    assert.equal(findLayoutViolations(root).filter((message) => message.includes('置けない物: misc/')).length, 1);
  });

  it('L5 rust の shared は mod.rs 以外の本体を直下に置くと落ちる', () => {
    const root = createTree(['shared/mod.rs', 'shared/helpers.rs']);

    const violations = findLayoutViolations(root, { extensions: ['rs'] });

    assert.equal(violations.filter((message) => message.includes('置けない物: helpers.rs')).length, 1);
  });

  it('L5 shared 以外の禁止名には例外が無い', () => {
    const root = createTree(['utils/domain/a.ts']);

    assert.equal(findLayoutViolations(root).filter((message) => message.includes('utils は作らない')).length, 1);
  });

  it('L4 --ext rs で rs の接頭辞共有 (firestore_a/b/c) が落ち、既定では見ない', () => {
    const root = createTree(['firestore_a.rs', 'firestore_b.rs', 'firestore_c.rs']);

    assert.equal(findLayoutViolations(root, { extensions: ['rs'] }).filter((message) => message.includes('接頭辞 firestore を 3 本')).length, 1);
    assert.deepEqual(findLayoutViolations(root), []);
  });

  it('L4 rs の _test.rs は本体に数えず、mod.rs は接頭辞に数えない', () => {
    const root = createTree(['mod.rs', 'repo_a.rs', 'repo_b.rs', 'repo_a_test.rs', 'repo_c_test.rs']);

    assert.deepEqual(findLayoutViolations(root, { extensions: ['rs'] }), []);
  });

  it('L4 --ext に対応外の拡張子を渡すと例外 (swift・mjs は掛ける先が無い)', () => {
    const root = createTree(['a.ts']);

    assert.throws(() => findLayoutViolations(root, { extensions: ['swift'] }), /--ext は/);
  });

  it('L4 CLI は --ext rs を受け取り、違反で 1、対応外の拡張子で 1 以外 (例外) になる', () => {
    const violating = createTree(['firestore_a.rs', 'firestore_b.rs', 'firestore_c.rs']);

    assert.equal(spawnSync('node', [CLI, violating, '--ext', 'rs']).status, 1);
    assert.equal(spawnSync('node', [CLI, violating]).status, 0);
    assert.notEqual(spawnSync('node', [CLI, violating, '--ext', 'swift']).status, 0);
  });
});
