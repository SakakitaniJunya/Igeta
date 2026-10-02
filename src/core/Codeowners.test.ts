// node --test dist/core/Codeowners.test.js
// CODEOWNERS の読み方 (GitHub の「About code owners」の規則)。文書にある例と、人の承認が要る側を守るために
// 使う書き方 (docs/person/・/docs/person/・docs/person/**・docs/person/*・* など) の当たり方を確かめる。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { codeownersPatternMatches, lastMatchingEntry, parseCodeowners } from './Codeowners.js';

type Case = readonly [pattern: string, path: string, matches: boolean];

function check(title: string, cases: readonly Case[]): void {
  it(title, () => {
    for (const [pattern, path, matches] of cases) {
      assert.equal(codeownersPatternMatches(pattern, path), matches, `${pattern} と ${path} は ${matches ? '当たる' : '当たらない'}はず`);
    }
  });
}

describe('parseCodeowners', () => {
  it('パターンとオーナーに分け、行番号 (1 始まり) を持つ。空行とコメントの行は読まない', () => {
    const entries = parseCodeowners(
      [
        '# コメント',
        '',
        '*       @global-owner1 @global-owner2',
        '   # 先頭が空白のコメント',
        '*.js    @js-owner',
        '/docs/  docs@example.com @org/team',
        '',
      ].join('\n'),
    );
    assert.deepEqual(entries, [
      { line: 3, pattern: '*', owners: ['@global-owner1', '@global-owner2'] },
      { line: 5, pattern: '*.js', owners: ['@js-owner'] },
      { line: 6, pattern: '/docs/', owners: ['docs@example.com', '@org/team'] },
    ]);
  });

  it('パターンだけの行は、オーナーを持たない行 (オーナーの後ろのコメントは含めない・パターンの中の # はコメントにしない)', () => {
    const entries = parseCodeowners(['/apps/github', 'docs/ # オーナーなし', 'logs/ @a # 担当', 'a#b/ @c'].join('\r\n'));
    assert.deepEqual(entries, [
      { line: 1, pattern: '/apps/github', owners: [] },
      { line: 2, pattern: 'docs/', owners: [] },
      { line: 3, pattern: 'logs/', owners: ['@a'] },
      { line: 4, pattern: 'a#b/', owners: ['@c'] },
    ]);
  });

  it('タブ区切りも読み、空の入力・コメントだけの入力は空', () => {
    assert.deepEqual(parseCodeowners('docs/\t@a\t@b\n'), [{ line: 1, pattern: 'docs/', owners: ['@a', '@b'] }]);
    assert.deepEqual(parseCodeowners(''), []);
    assert.deepEqual(parseCodeowners('# だけ\n\n   \n'), []);
  });
});

describe('codeownersPatternMatches: GitHub の文書の例', () => {
  check('* は全部のファイル。*.js はどの階層の .js にも当たる', [
    ['*', 'README.md', true],
    ['*', 'docs/person/design/shared/00-map.md', true],
    ['*', '.github/CODEOWNERS', true],
    ['*.js', 'a.js', true],
    ['*.js', 'src/deep/b.js', true],
    ['*.js', 'a.jsx', false],
    ['*.js', 'src/js', false],
  ]);

  check('/build/logs/ は repo 直下の build/logs の中の全部 (下のフォルダも)。別の階層の build/logs には当たらない', [
    ['/build/logs/', 'build/logs/x.log', true],
    ['/build/logs/', 'build/logs/sub/y.log', true],
    ['/build/logs/', 'src/build/logs/x.log', false],
    ['/build/logs/', 'build/logs', false],
    ['/build/logs/', 'build/logs-old/x.log', false],
  ]);

  check('docs/* は docs の直下のファイルだけで、さらに下の docs/build-app/troubleshooting.md には当たらない', [
    ['docs/*', 'docs/getting-started.md', true],
    ['docs/*', 'docs/build-app/troubleshooting.md', false],
    ['docs/*', 'x/docs/getting-started.md', false],
  ]);

  check('/docs/* も同じ (repo 直下の docs の、直下のファイルだけ)', [
    ['/docs/*', 'docs/a.md', true],
    ['/docs/*', 'docs/b/c.md', false],
  ]);

  check('apps/ のように名前と末尾の / だけなら、どの階層の apps の中の全部にも当たる', [
    ['apps/', 'apps/a.md', true],
    ['apps/', 'x/apps/a.md', true],
    ['apps/', 'x/y/apps/z/a.md', true],
    ['apps/', 'myapps/a.md', false],
    ['apps/', 'apps', false],
  ]);

  check('/docs/ は repo 直下の docs の中の全部で、他の階層の docs には当たらない。docs/ はどの階層の docs にも当たる', [
    ['/docs/', 'docs/a.md', true],
    ['/docs/', 'docs/b/c.md', true],
    ['/docs/', 'x/docs/a.md', false],
    ['docs/', 'docs/a.md', true],
    ['docs/', 'x/docs/a.md', true],
  ]);

  check('**/logs は、どの階層の logs にも当たる (/build/logs・/scripts/logs・/deeply/nested/logs)', [
    ['**/logs', 'logs/a', true],
    ['**/logs', 'build/logs/a', true],
    ['**/logs', 'scripts/logs/a', true],
    ['**/logs', 'deeply/nested/logs/a', true],
    ['**/logs', 'build/xlogs/a', false],
  ]);

  check('/apps/ のあとに オーナーなしの /apps/github を書く例の、/apps/github は apps/github の中の全部に当たる', [
    ['/apps/', 'apps/a.md', true],
    ['/apps/', 'apps/github/b.md', true],
    ['/apps/github', 'apps/github/b.md', true],
    ['/apps/github', 'apps/github', true],
    ['/apps/github', 'apps/githubx/b.md', false],
    ['/apps/github', 'apps/a.md', false],
  ]);
});

describe('codeownersPatternMatches: docs/person/ を守る書き方', () => {
  const DEEP = 'docs/person/design/shared/00-map.md';
  const DIRECT = 'docs/person/README.md';

  check('配下全体に当たる書き方: docs/person/・/docs/person/・docs/person/**・名前だけの docs/person', [
    ['docs/person/', DEEP, true],
    ['docs/person/', DIRECT, true],
    ['/docs/person/', DEEP, true],
    ['/docs/person/', DIRECT, true],
    ['docs/person/**', DEEP, true],
    ['docs/person/**', DIRECT, true],
    ['/docs/person/**', DEEP, true],
    ['docs/person', DEEP, true],
    ['/docs/person', DEEP, true],
    ['docs/**', DEEP, true],
    ['docs/**/*.md', DEEP, true],
  ]);

  check('docs/person/* は直下のファイルだけ。下のフォルダの文書には当たらない', [
    ['docs/person/*', DIRECT, true],
    ['docs/person/*', DEEP, false],
    ['docs/person/*', 'docs/person/decisions/2026/0001-x.md', false],
    ['/docs/person/*', DIRECT, true],
    ['/docs/person/*', DEEP, false],
  ]);

  check('1 つ下のフォルダの * (docs/person/*/) は、その下のフォルダの中だけ。直下のファイルには当たらない', [
    ['docs/person/*/', DEEP, true],
    ['docs/person/*/', DIRECT, false],
  ]);

  check('名前の続きだけが似ているフォルダ・別の階層の docs/person には当たらない', [
    ['docs/person/', 'docs/personal/x.md', false],
    ['docs/person', 'docs/personal/x.md', false],
    ['docs/person/', 'x/docs/person/design/a.md', false],
    ['/docs/person/', 'x/docs/person/a.md', false],
    ['docs/person/**', 'docs/person', false],
  ]);

  check('* だけ・** だけは全部に当たる', [
    ['*', DEEP, true],
    ['**', DEEP, true],
    ['/**', DEEP, true],
    ['**/*', DEEP, true],
  ]);
});

describe('codeownersPatternMatches: 設定ファイルを守る書き方', () => {
  check('名前だけ (AGENTS.md・package.json) はどの階層にも当たり、先頭に / を付けると repo 直下だけ', [
    ['AGENTS.md', 'AGENTS.md', true],
    ['AGENTS.md', 'sub/AGENTS.md', true],
    ['AGENTS.md', 'AGENTS.md.bak', false],
    ['/AGENTS.md', 'AGENTS.md', true],
    ['/AGENTS.md', 'sub/AGENTS.md', false],
    ['package.json', 'package.json', true],
    ['package.json', 'packages/a/package.json', true],
    ['/package.json', 'packages/a/package.json', false],
    ['.igeta.json', '.igeta.json', true],
    ['/.igeta.json', '.igeta.json', true],
  ]);

  check('.github/ と /.github/ は CODEOWNERS と workflows の両方。.github/workflows/ は workflows だけ', [
    ['/.github/', '.github/CODEOWNERS', true],
    ['/.github/', '.github/workflows/ci.yml', true],
    ['.github/', '.github/CODEOWNERS', true],
    ['.github/', 'x/.github/CODEOWNERS', true],
    ['/.github/', 'x/.github/CODEOWNERS', false],
    ['.github/workflows/', '.github/workflows/ci.yml', true],
    ['.github/workflows/', '.github/CODEOWNERS', false],
    ['.github/workflows/**', '.github/workflows/ci.yml', true],
    ['.github/workflows/*', '.github/workflows/ci.yml', true],
    ['.github/workflows/*', '.github/workflows/sub/ci.yml', false],
    ['.github/CODEOWNERS', '.github/CODEOWNERS', true],
    ['.github/CODEOWNERS', 'x/.github/CODEOWNERS', false],
  ]);
});

describe('codeownersPatternMatches: そのほかの書き方', () => {
  check('/**/ は 0 個以上の階層。a/**/b は a/b にも a/x/y/b にも当たる', [
    ['docs/**/guide.md', 'docs/guide.md', true],
    ['docs/**/guide.md', 'docs/a/guide.md', true],
    ['docs/**/guide.md', 'docs/a/b/guide.md', true],
    ['docs/**/guide.md', 'docs/a/b/guide.txt', false],
    ['docs/**/guide.md', 'x/docs/guide.md', false],
  ]);

  check('? は / 以外の 1 文字。* は階層の中の任意の文字で / をまたがない', [
    ['docs/a?.md', 'docs/ab.md', true],
    ['docs/a?.md', 'docs/a.md', false],
    ['docs/a?.md', 'docs/a/b.md', false],
    ['docs/p*.md', 'docs/plan.md', true],
    ['docs/p*.md', 'docs/p/lan.md', false],
    ['docs/p*', 'docs/plan/x.md', true],
  ]);

  check('正規表現の記号は、ただの文字として読む。バックスラッシュは次の 1 文字をそのままの文字にする', [
    ['docs/a+b.md', 'docs/a+b.md', true],
    ['docs/a+b.md', 'docs/aab.md', false],
    ['docs/(x).md', 'docs/(x).md', true],
    ['docs/a\\*b.md', 'docs/a*b.md', true],
    ['docs/a\\*b.md', 'docs/aXb.md', false],
  ]);

  check('大文字小文字は区別する。/ だけの行は、何にも当たらない', [
    ['Docs/', 'docs/a.md', false],
    ['docs/', 'Docs/a.md', false],
    ['/', 'docs/a.md', false],
    ['/', 'a', false],
  ]);
});

describe('lastMatchingEntry (最後に当たった行)', () => {
  const entries = parseCodeowners(
    ['* @lead', 'docs/ @docs-team', 'docs/person/ @owner', 'docs/person/decisions/', '/docs/person/design/shared/00-map.md @map-owner'].join('\n'),
  );

  it('複数の行が当たるときは、最後の行だけ。前の行のオーナーは引き継がない', () => {
    assert.deepEqual(lastMatchingEntry(entries, 'README.md'), { line: 1, pattern: '*', owners: ['@lead'] });
    assert.deepEqual(lastMatchingEntry(entries, 'docs/guide/a.md'), { line: 2, pattern: 'docs/', owners: ['@docs-team'] });
    assert.deepEqual(lastMatchingEntry(entries, 'docs/person/requirements/01-requirements.md'), {
      line: 3,
      pattern: 'docs/person/',
      owners: ['@owner'],
    });
    assert.deepEqual(lastMatchingEntry(entries, 'docs/person/design/shared/00-map.md')?.owners, ['@map-owner']);
  });

  it('オーナーの無い行が最後に当たるパスは、オーナー無し', () => {
    assert.deepEqual(lastMatchingEntry(entries, 'docs/person/decisions/2026/0001-x.md'), {
      line: 4,
      pattern: 'docs/person/decisions/',
      owners: [],
    });
  });

  it('どの行にも当たらなければ undefined。行が無くても undefined', () => {
    assert.equal(lastMatchingEntry(parseCodeowners('/docs/ @a\n'), 'src/a.ts'), undefined);
    assert.equal(lastMatchingEntry([], 'a'), undefined);
  });
});
