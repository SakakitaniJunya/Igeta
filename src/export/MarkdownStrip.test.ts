// node --test dist
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { UnclosedAutogenError, joinStrippedLines, stripFrontmatterAndAutogen } from './MarkdownStrip.js';

describe('stripFrontmatterAndAutogen', () => {
  it('frontmatter を除去し、元の行番号を保持する', () => {
    const content = ['---', 'id: x', 'title: y', '---', '', '# 見出し', '', '本文'].join('\n');
    const lines = stripFrontmatterAndAutogen(content, 'a.md');
    assert.deepEqual(
      lines.map((l) => l.text),
      ['', '# 見出し', '', '本文'],
    );
    // frontmatter は 1-4 行目。本文の 1 行目は元ファイルの 5 行目
    assert.equal(lines[0]?.line, 5);
    assert.equal(lines[1]?.line, 6);
  });

  it('AUTOGEN 区間をマーカーごと除去する', () => {
    const content = [
      '# 見出し',
      '本文1',
      '<!-- AUTOGEN:dir-index:start -->',
      '生成された行1',
      '生成された行2',
      '<!-- AUTOGEN:dir-index:end -->',
      '本文2',
    ].join('\n');
    const lines = stripFrontmatterAndAutogen(content, 'a.md');
    assert.deepEqual(
      lines.map((l) => l.text),
      ['# 見出し', '本文1', '本文2'],
    );
    // 本文2 は元ファイルの 7 行目のまま
    assert.equal(lines[2]?.line, 7);
  });

  it('frontmatter が無ければそのまま (先頭行が 1)', () => {
    const content = '# 見出し\n本文';
    const lines = stripFrontmatterAndAutogen(content, 'a.md');
    assert.equal(lines[0]?.line, 1);
    assert.equal(lines[0]?.text, '# 見出し');
  });

  it('閉じていない frontmatter らしき --- は frontmatter として扱わない', () => {
    const content = '---\nこれは frontmatter ではない';
    const lines = stripFrontmatterAndAutogen(content, 'a.md');
    assert.equal(lines[0]?.text, '---');
  });

  it('joinStrippedLines は text だけを改行で結合する', () => {
    const content = '---\nid: x\n---\n# 見出し\n本文';
    const lines = stripFrontmatterAndAutogen(content, 'a.md');
    assert.equal(joinStrippedLines(lines), '# 見出し\n本文');
  });

  it('AUTOGEN が章の終わりまで閉じられていなければ、本文を捨てずに UnclosedAutogenError で止める', () => {
    const content = ['# 見出し', '本文1', '<!-- AUTOGEN:dir-index:start -->', '生成された行', '本文2 (閉じタグ無し)'].join(
      '\n',
    );
    assert.throws(() => stripFrontmatterAndAutogen(content, '00-intro.md'), UnclosedAutogenError);
    try {
      stripFrontmatterAndAutogen(content, '00-intro.md');
      assert.fail('UnclosedAutogenError を期待した');
    } catch (error) {
      assert.ok(error instanceof UnclosedAutogenError);
      // AUTOGEN:start は 3 行目、ファイル名も入っていること
      assert.match(error.message, /00-intro\.md:3/);
    }
  });
});
