// node --test dist/checks/TraceLoad.test.js
// コードの探し方(glob の固定の頭から歩く・シンボリックリンク)と、origin の文書の除外。
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isListedDoc, loadCodeFiles } from './TraceLoad.js';

const roots: string[] = [];
after(() => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-traceload-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe('loadCodeFiles', () => {
  it('glob の固定の頭のフォルダだけを歩く (src/** なら other/ は読まない)', () => {
    const root = repo({ 'src/a.ts': '// a', 'other/b.ts': '// b' });
    assert.deepEqual(loadCodeFiles(root, ['src/**']).map((file) => file.path), ['src/a.ts']);
  });

  it('シンボリックリンクのファイルを読み、リンクの循環では止まる', () => {
    const root = repo({ 'src/real.ts': '// real', 'elsewhere/target.ts': '// target' });
    symlinkSync(join(root, 'elsewhere/target.ts'), join(root, 'src/linked.ts'));
    symlinkSync(join(root, 'src'), join(root, 'src/loop'));
    assert.deepEqual(loadCodeFiles(root, ['src/**']).map((file) => file.path), ['src/linked.ts', 'src/real.ts']);
  });

  it('固定のパスの glob はそのファイルだけを読む。無ければ空', () => {
    const root = repo({ 'src/a.ts': '// a' });
    assert.deepEqual(loadCodeFiles(root, ['src/a.ts']).map((file) => file.path), ['src/a.ts']);
    assert.deepEqual(loadCodeFiles(root, ['nothing/**']), []);
  });
});

describe('isListedDoc', () => {
  it('点で始まるフォルダと node_modules の下の文書は、作業ツリー側と同じく対象外', () => {
    assert.equal(isListedDoc('person/a.md'), true);
    assert.equal(isListedDoc('.cache/a.md'), false);
    assert.equal(isListedDoc('site/node_modules/x/a.md'), false);
    assert.equal(isListedDoc('.hidden.md'), true);
  });
});
