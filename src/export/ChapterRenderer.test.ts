// node --test dist
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChapterInput } from './ChapterRenderer.js';
import { renderChapters } from './ChapterRenderer.js';

function chapter(relPath: string, strippedText: string): ChapterInput {
  return { relPath, absPath: `/virtual/${relPath}`, strippedText };
}

describe('renderChapters — 目次', () => {
  it('h1/h2 だけを章の順で拾う (h3 以下は含めない)', () => {
    const result = renderChapters([
      chapter('00-intro.md', '# はじめに\n\n## 概要\n\n### 詳細 (目次に出ない)\n'),
      chapter('01-flows.md', '# 処理フロー\n\n## 流れ\n'),
    ]);
    assert.deepEqual(
      result.toc.map((t) => [t.level, t.text]),
      [
        [1, 'はじめに'],
        [2, '概要'],
        [1, '処理フロー'],
        [2, '流れ'],
      ],
    );
  });

  it('同じ見出しテキストが複数あれば id を重複させない', () => {
    const result = renderChapters([chapter('a.md', '# 概要\n\n本文\n\n# 概要\n')]);
    const ids = result.toc.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('renderChapters — 章間リンク', () => {
  it('manifest 内の章 + アンカーは PDF 内アンカーへ書き換える', () => {
    const result = renderChapters([
      chapter('00-intro.md', '# はじめに\n\n[流れへ](01-flows.md#処理の流れ)\n'),
      chapter('01-flows.md', '# 処理フロー\n\n## 処理の流れ\n'),
    ]);
    const intro = result.chapters[0];
    assert.ok(intro);
    const flowsHeadingId = result.toc.find((t) => t.text === '処理の流れ')?.id;
    assert.ok(flowsHeadingId !== undefined);
    assert.match(intro.html, new RegExp(`href="#${flowsHeadingId}"`));
    assert.deepEqual(result.warnings, []);
  });

  it('アンカー無しの章内リンクは章の先頭 (sectionId) へ書き換える', () => {
    const result = renderChapters([
      chapter('00-intro.md', '# はじめに\n\n[flowsへ](01-flows.md)\n'),
      chapter('01-flows.md', '# 処理フロー\n'),
    ]);
    const intro = result.chapters[0];
    const flows = result.chapters[1];
    assert.ok(intro && flows);
    assert.match(intro.html, new RegExp(`href="#${flows.sectionId}"`));
  });

  it('外部リンクはリンクを外し文字だけ残して警告を出す', () => {
    const result = renderChapters([chapter('00-intro.md', '# はじめに\n\n[参照](https://example.com/x)\n')]);
    const html = result.chapters[0]?.html ?? '';
    assert.ok(!html.includes('<a'));
    assert.match(html, /参照/);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0] ?? '', /外部リンク/);
  });

  it('manifest 外の相対リンクはリンクを外し警告を出す', () => {
    const result = renderChapters([chapter('00-intro.md', '# はじめに\n\n[他](99-none.md)\n')]);
    const html = result.chapters[0]?.html ?? '';
    assert.ok(!html.includes('<a'));
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0] ?? '', /manifest 外/);
  });

  it('存在しないアンカーへのリンクはリンクを外し警告を出す', () => {
    const result = renderChapters([
      chapter('00-intro.md', '# はじめに\n\n[無い節](01-flows.md#無い見出し)\n'),
      chapter('01-flows.md', '# 処理フロー\n'),
    ]);
    const html = result.chapters[0]?.html ?? '';
    assert.ok(!html.includes('<a'));
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0] ?? '', /アンカーが見つからない/);
  });
});

describe('renderChapters — mermaid', () => {
  it('```mermaid フェンスを <pre class="mermaid"> に変換し mermaidBlocks へ登録する', () => {
    const result = renderChapters([
      chapter('00-intro.md', '# はじめに\n\n```mermaid\nflowchart LR\n  A --> B\n```\n'),
    ]);
    const html = result.chapters[0]?.html ?? '';
    assert.match(html, /<pre class="mermaid" id="mermaid-diagram-0">/);
    assert.match(html, /flowchart LR/);
    assert.equal(result.mermaidBlocks.length, 1);
    assert.equal(result.mermaidBlocks[0]?.chapterRelPath, '00-intro.md');
  });

  it('通常のコードフェンスは <pre class="mermaid"> にしない', () => {
    const result = renderChapters([chapter('00-intro.md', '```ts\nconst x = 1;\n```\n')]);
    const html = result.chapters[0]?.html ?? '';
    assert.ok(!html.includes('class="mermaid"'));
    assert.equal(result.mermaidBlocks.length, 0);
  });
});
