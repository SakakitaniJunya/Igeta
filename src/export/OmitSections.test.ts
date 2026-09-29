// node --test dist
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripFrontmatterAndAutogen } from './MarkdownStrip.js';
import { omitSections } from './OmitSections.js';

function textOf(lines: readonly { text: string }[]): string {
  return lines.map((l) => l.text).join('\n');
}

const WITH_TRAILING_RELATED = [
  '# はじめに',
  '',
  '本文1',
  '',
  '## 関連',
  '',
  '| 区分 | 文書 |',
  '|---|---|',
  '| 上流 | x |',
].join('\n');

const WITH_MIDDLE_RELATED = [
  '# はじめに',
  '',
  '## 関連',
  '',
  '| 区分 | 文書 |',
  '|---|---|',
  '| 上流 | x |',
  '',
  '## 概要',
  '',
  '本文2',
].join('\n');

describe('omitSections', () => {
  it('既定 ["関連"] で節が文書末尾にある場合に丸ごと除く', () => {
    const lines = stripFrontmatterAndAutogen(WITH_TRAILING_RELATED, 'a.md');
    const result = omitSections(lines, ['関連']);
    const text = textOf(result);
    assert.ok(text.includes('本文1'));
    assert.ok(!text.includes('## 関連'));
    assert.ok(!text.includes('上流'));
  });

  it('既定 ["関連"] で節が文書途中にある場合、次の H2 までを除く (次の節は残る)', () => {
    const lines = stripFrontmatterAndAutogen(WITH_MIDDLE_RELATED, 'a.md');
    const result = omitSections(lines, ['関連']);
    assert.equal(textOf(result), '# はじめに\n\n## 概要\n\n本文2');
  });

  it('見出し文字列を上書きすれば別の節を除ける', () => {
    const content = '# t\n\n## 社内メモ\n\n本文\n\n## 概要\n\n概要本文\n';
    const lines = stripFrontmatterAndAutogen(content, 'a.md');
    const result = omitSections(lines, ['社内メモ']);
    const text = textOf(result);
    assert.ok(!text.includes('社内メモ'));
    assert.ok(text.includes('## 概要'));
    assert.ok(text.includes('概要本文'));
  });

  it('[] を渡せば何も除かない', () => {
    const lines = stripFrontmatterAndAutogen(WITH_TRAILING_RELATED, 'a.md');
    const result = omitSections(lines, []);
    assert.deepEqual(result, lines);
  });

  it('除いた節の中の見出し (H3 以下) も一緒に除く', () => {
    const content = ['# t', '', '## 関連', '', '### 内訳', '', '詳細', '', '## 次の節', '', '本文'].join('\n');
    const lines = stripFrontmatterAndAutogen(content, 'a.md');
    const result = omitSections(lines, ['関連']);
    assert.equal(textOf(result), '# t\n\n## 次の節\n\n本文');
  });

  it('コードフェンス内の # は見出しとして扱わない (フェンスごと保持/除去される)', () => {
    const content = ['# t', '', '```', '## 関連 (コード内)', '```', '', '本文'].join('\n');
    const lines = stripFrontmatterAndAutogen(content, 'a.md');
    const result = omitSections(lines, ['関連']);
    assert.equal(textOf(result), content);
  });
});
