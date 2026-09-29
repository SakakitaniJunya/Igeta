// node --test dist
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatForbidHit, scanForbidden } from './ForbidScan.js';
import { stripFrontmatterAndAutogen } from './MarkdownStrip.js';

function makePatterns(sources: readonly string[]): RegExp[] {
  return sources.map((s) => new RegExp(s, 'gu'));
}

describe('scanForbidden', () => {
  it('一致すれば file:line:word を返す', () => {
    const lines = stripFrontmatterAndAutogen('# t\n\n社内メモ: DEC-42 を参照\n');
    const sources = ['DEC-\\d+'];
    const hits = scanForbidden('00-intro.md', lines, makePatterns(sources), sources);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.file, '00-intro.md');
    assert.equal(hits[0]?.line, 3);
    assert.equal(hits[0]?.word, 'DEC-42');
  });

  it('1 行に複数パターンが一致すれば全件返す', () => {
    const lines = stripFrontmatterAndAutogen('DEC-1 と REQ-2 が同じ行にある');
    const sources = ['DEC-\\d', 'REQ-\\d'];
    const hits = scanForbidden('a.md', lines, makePatterns(sources), sources);
    assert.equal(hits.length, 2);
  });

  it('一致が無ければ空配列', () => {
    const lines = stripFrontmatterAndAutogen('普通の本文');
    const sources = ['DEC-\\d'];
    const hits = scanForbidden('a.md', lines, makePatterns(sources), sources);
    assert.deepEqual(hits, []);
  });

  it('frontmatter / AUTOGEN 区間は除去済みなのでスキャン対象外', () => {
    const content = ['---', 'id: DEC-1', '---', '<!-- AUTOGEN:x:start -->', 'DEC-2', '<!-- AUTOGEN:x:end -->', '本文'].join(
      '\n',
    );
    const lines = stripFrontmatterAndAutogen(content);
    const sources = ['DEC-\\d'];
    const hits = scanForbidden('a.md', lines, makePatterns(sources), sources);
    assert.deepEqual(hits, []);
  });

  it('formatForbidHit は file:line: word (forbid: pattern) の形式', () => {
    const message = formatForbidHit({ file: 'a.md', line: 3, word: 'DEC-42', pattern: 'DEC-\\d+' });
    assert.equal(message, 'a.md:3: DEC-42 (forbid: DEC-\\d+)');
  });
});
