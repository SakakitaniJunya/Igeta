// node --test dist/core/LinkTable.test.js
// ADR-0007 決定 1 の表 (外部 URL・アンカーだけ・id のある文書・id の無い文書・docs/ の外・存在しない) を 1 行ずつ確かめる。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildLinkTable } from './LinkTable.js';
import { buildSourceIndex } from './SourceResolver.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function write(root: string, rel: string, content: string): void {
  const target = join(root, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

const withId = (id: string): string => ['---', `id: ${id}`, 'kind: requirements', 'depends_on: []', '---', '', '# 文書', ''].join('\n');

/** docs/ に id のある文書・id の無い文書・README を置いた repo。 */
function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-linktable-'));
  workspaces.push(root);
  write(root, 'docs/req/a.md', withId('doc-a'));
  write(root, 'docs/req/my doc.md', withId('doc-my'));
  write(root, 'docs/req/noid.md', '# id の無い文書\n');
  write(root, 'docs/req/README.md', withId('req-readme'));
  write(root, 'docs/sub/.keep', '');
  write(root, 'README.md', '# repo\n');
  write(root, 'src/code.ts', 'export {};\n');
  return root;
}

function rewriter(root: string, docPath: string): (destination: string) => string {
  return buildLinkTable(root, buildSourceIndex(root, join(root, 'docs'))).rewriterFor(docPath);
}

describe('LinkTable (ADR-0007 決定 1 の表)', () => {
  const root = makeRepo();
  const rewrite = rewriter(root, 'docs/design/x.md');

  it('外部 URL・mailto・アンカーだけ・直した後の id: は、そのまま残す', () => {
    assert.equal(rewrite('https://example.com/a#b'), 'https://example.com/a#b');
    assert.equal(rewrite('mailto:team@example.com'), 'mailto:team@example.com');
    assert.equal(rewrite('#節'), '#節');
    assert.equal(rewrite('id:doc-a#節'), 'id:doc-a#節');
  });

  it('frontmatter id のある文書は id: <id> に置き換え、アンカーは残す', () => {
    assert.equal(rewrite('../req/a.md'), 'id:doc-a');
    assert.equal(rewrite('../req/a.md#機能要件'), 'id:doc-a#機能要件');
    assert.equal(rewrite('./../req/./a.md#x'), 'id:doc-a#x', './ と ../ をたたんでから引く');
    assert.equal(rewrite('../req/a.md#'), 'id:doc-a#', '空のアンカーもそのまま残す');
  });

  it('リンクの相対パスは、本文がある文書を起点に解決する', () => {
    assert.equal(rewriter(root, 'docs/req/x.md')('./a.md'), 'id:doc-a');
    assert.equal(rewriter(root, 'docs/design/sub/x.md')('../../req/a.md'), 'id:doc-a');
    assert.equal(rewriter(root, 'docs/design/sub/x.md')('../req/a.md'), '../req/a.md', '起点が違えば別のパス (存在しないのでそのまま)');
  });

  it('先頭が / のパスは repo 直下からのパスとして引く (docs-check の本文リンクの検査と同じ解釈)', () => {
    assert.equal(rewrite('/docs/req/a.md#x'), 'id:doc-a#x');
    assert.equal(rewrite('/README.md'), 'README.md');
  });

  it('百分率エンコードされたパスは戻してから引く。壊れた列はそのまま使う', () => {
    assert.equal(rewrite('../req/my%20doc.md#x'), 'id:doc-my#x');
    assert.equal(rewrite('../req/%E3%81%82%.md'), '../req/%E3%81%82%.md');
  });

  it('docs/ 内だが id の無い文書は、repo 相対の正規パスに直す (リンク元を動かしても変わらない)', () => {
    assert.equal(rewrite('../req/noid.md#x'), 'docs/req/noid.md#x');
    assert.equal(rewriter(root, 'docs/design/sub/x.md')('../../req/noid.md#x'), 'docs/req/noid.md#x');
  });

  it('docs/ の外の実在ファイル (repo 直下の README.md・コード) は、repo 相対の正規パスに直す', () => {
    assert.equal(rewrite('../../README.md'), 'README.md');
    assert.equal(rewrite('../../src/code.ts#L10'), 'src/code.ts#L10');
    assert.equal(rewriter(root, 'README.md')('docs/req/noid.md'), 'docs/req/noid.md', 'repo 直下の文書から');
  });

  it('実在するディレクトリも、repo 相対の正規パスに直す (末尾の / は除く)', () => {
    assert.equal(rewrite('../sub/'), 'docs/sub');
    assert.equal(rewrite('../sub'), 'docs/sub');
  });

  it('存在しないファイルは、そのまま残す (リンク切れは docs-check が別に落とす)', () => {
    assert.equal(rewrite('../req/missing.md#x'), '../req/missing.md#x');
    assert.equal(rewrite('./nope.md'), './nope.md');
  });

  it('README.md は索引 (buildSourceIndex) の対象外なので、id を持っていても repo 相対パスで数える (既知の限界)', () => {
    assert.equal(rewrite('../req/README.md'), 'docs/req/README.md');
  });

  it('docs が無い repo (索引が null) は id の表が空で、実在するかどうかだけで決まる', () => {
    const noDocs = mkdtempSync(join(tmpdir(), 'igeta-linktable-nodocs-'));
    workspaces.push(noDocs);
    write(noDocs, 'README.md', '# repo\n');
    const table = buildLinkTable(noDocs, buildSourceIndex(noDocs, join(noDocs, 'docs')));
    assert.equal(table.rewriterFor('notes/x.md')('../README.md'), 'README.md');
    assert.equal(table.rewriterFor('notes/x.md')('../nope.md'), '../nope.md');
  });
});
