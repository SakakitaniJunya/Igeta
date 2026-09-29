// node --test dist/core/ContextGraph.test.js
// context-boundary-check / context-size / context-files が共有する参照抽出そのものを単体で確かめる
// (code-reviewer round 1 non-blocking 6)。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildContextGraph, extractReferences } from './ContextGraph.js';
import type { ContextDoc } from './ContextGraph.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'yatsu-ctxgraph-'));
  workspaces.push(root);
  return root;
}

function writeDoc(root: string, relPath: string, lines: readonly string[]): void {
  const target = join(root, 'docs', relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${lines.join('\n')}\n`);
}

function findDoc(graph: NonNullable<ReturnType<typeof buildContextGraph>>, relPathEnd: string): ContextDoc {
  const doc = graph.docs.find((d) => d.relPath.endsWith(relPathEnd));
  assert.ok(doc, `doc not found: ${relPathEnd} (have: ${graph.docs.map((d) => d.relPath).join(', ')})`);
  return doc;
}

describe('buildContextGraph', () => {
  it('frontmatter の id・kind・context・depends_on を読む', () => {
    const root = makeRoot();
    writeDoc(root, 'a.md', ['---', 'id: doc-a', 'kind: requirements', 'context: reservation', 'depends_on: [doc-b]', '---', '', '# A']);
    const graph = buildContextGraph(root, join(root, 'docs'));
    assert.ok(graph);
    const doc = findDoc(graph, 'a.md');
    assert.equal(doc.id, 'doc-a');
    assert.equal(doc.kind, 'requirements');
    assert.equal(doc.context, 'reservation');
    assert.deepEqual(doc.dependsOn, ['doc-b']);
  });

  it('docsDir が無ければ null', () => {
    assert.equal(buildContextGraph('/x', '/x/nonexistent-docs'), null);
  });
});

describe('extractReferences', () => {
  it('depends_on だけによる参照を解決する', () => {
    const root = makeRoot();
    writeDoc(root, 'a.md', ['---', 'id: doc-a', 'kind: requirements', 'depends_on: [doc-b]', '---', '', '# A']);
    writeDoc(root, 'b.md', ['---', 'id: doc-b', 'kind: requirements', 'depends_on: []', '---', '', '# B']);
    const graph = buildContextGraph(root, join(root, 'docs'));
    assert.ok(graph);
    const a = findDoc(graph, 'a.md');
    const refs = extractReferences(a, graph, root);
    assert.equal(refs.length, 1);
    assert.equal(refs[0]?.target.id, 'doc-b');
  });

  it('アンカー付きリンク (#anchor) を解決する', () => {
    const root = makeRoot();
    writeDoc(root, 'a.md', ['---', 'id: doc-a', 'kind: requirements', 'depends_on: []', '---', '', '# A', '', '[B](./b.md#見出し) を参照。']);
    writeDoc(root, 'b.md', ['---', 'id: doc-b', 'kind: requirements', 'depends_on: []', '---', '', '# B']);
    const graph = buildContextGraph(root, join(root, 'docs'));
    assert.ok(graph);
    const refs = extractReferences(findDoc(graph, 'a.md'), graph, root);
    assert.equal(refs.length, 1);
    assert.equal(refs[0]?.target.id, 'doc-b');
  });

  it('タイトル付きリンク ("title") を解決する', () => {
    const root = makeRoot();
    writeDoc(root, 'a.md', ['---', 'id: doc-a', 'kind: requirements', 'depends_on: []', '---', '', '# A', '', '[B](./b.md "説明") を参照。']);
    writeDoc(root, 'b.md', ['---', 'id: doc-b', 'kind: requirements', 'depends_on: []', '---', '', '# B']);
    const graph = buildContextGraph(root, join(root, 'docs'));
    assert.ok(graph);
    const refs = extractReferences(findDoc(graph, 'a.md'), graph, root);
    assert.equal(refs.length, 1);
    assert.equal(refs[0]?.target.id, 'doc-b');
  });

  it('`../` を含む相対リンクを解決する', () => {
    const root = makeRoot();
    writeDoc(root, 'nested/a.md', ['---', 'id: doc-a', 'kind: requirements', 'depends_on: []', '---', '', '# A', '', '[B](../b.md) を参照。']);
    writeDoc(root, 'b.md', ['---', 'id: doc-b', 'kind: requirements', 'depends_on: []', '---', '', '# B']);
    const graph = buildContextGraph(root, join(root, 'docs'));
    assert.ok(graph);
    const refs = extractReferences(findDoc(graph, 'nested/a.md'), graph, root);
    assert.equal(refs.length, 1);
    assert.equal(refs[0]?.target.id, 'doc-b');
  });

  it('参照先が存在しないリンクは無視する (落ちない・参照にも数えない)', () => {
    const root = makeRoot();
    writeDoc(root, 'a.md', ['---', 'id: doc-a', 'kind: requirements', 'depends_on: []', '---', '', '# A', '', '[消えた文書](./missing.md) を参照。']);
    const graph = buildContextGraph(root, join(root, 'docs'));
    assert.ok(graph);
    const refs = extractReferences(findDoc(graph, 'a.md'), graph, root);
    assert.deepEqual(refs, []);
  });

  it('修飾 ID (<doc-id>/PREFIX-nnn) による参照を解決する', () => {
    const root = makeRoot();
    writeDoc(root, 'a.md', ['---', 'id: doc-a', 'kind: requirements', 'depends_on: []', '---', '', '# A', '', 'doc-b/REQ-001 を見る。']);
    writeDoc(root, 'b.md', ['---', 'id: doc-b', 'kind: requirements', 'depends_on: []', '---', '', '# B', '', '| REQ-001 | 内容 |']);
    const graph = buildContextGraph(root, join(root, 'docs'));
    assert.ok(graph);
    const refs = extractReferences(findDoc(graph, 'a.md'), graph, root);
    assert.equal(refs.length, 1);
    assert.equal(refs[0]?.target.id, 'doc-b');
  });

  it('自分自身への depends_on・リンクは参照に数えない', () => {
    const root = makeRoot();
    writeDoc(root, 'a.md', ['---', 'id: doc-a', 'kind: requirements', 'depends_on: [doc-a]', '---', '', '# A', '', '[自分](./a.md) を参照。']);
    const graph = buildContextGraph(root, join(root, 'docs'));
    assert.ok(graph);
    const refs = extractReferences(findDoc(graph, 'a.md'), graph, root);
    assert.deepEqual(refs, []);
  });
});
