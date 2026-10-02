// node --test dist/gate/PathGlob.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { globCanMatchUnder, matchesGlob, validateGlob } from './PathGlob.js';

describe('matchesGlob', () => {
  const cases: ReadonlyArray<readonly [pattern: string, path: string, expected: boolean]> = [
    // ADR-0008 が Igeta 自身の humanPaths に足す glob
    ['templates/**', 'templates/docs/README.md', true],
    ['templates/**', 'templates/api-module/src/index.ts', true],
    ['templates/**', 'src/templates/x.md', false],
    ['src/checks/**', 'src/checks/DocGraphCheck.ts', true],
    ['src/checks/**', 'src/checks/sub/Deep.ts', true],
    ['src/checks/**', 'src/cli/checks/X.ts', false],
    ['src/core/Role.ts', 'src/core/Role.ts', true],
    ['src/core/Role.ts', 'src/core/Roles.ts', false],
    ['docs/explanation/0[3-9]-*.md', 'docs/explanation/03-audience-layers.md', true],
    ['docs/explanation/0[3-9]-*.md', 'docs/explanation/09-reader-granularity.md', true],
    ['docs/explanation/0[3-9]-*.md', 'docs/explanation/02-human-review-layer.md', false],
    ['docs/explanation/0[3-9]-*.md', 'docs/explanation/10-folder-placement.md', false],
    ['docs/explanation/0[3-9]-*.md', 'docs/explanation/README.md', false],
    // `**` は 0 個以上の階層
    ['docs/**/README.md', 'docs/README.md', true],
    ['docs/**/README.md', 'docs/person/requirements/README.md', true],
    ['docs/**/README.md', 'docs/person/requirements/01.md', false],
    ['**/*.md', 'README.md', true],
    ['**/*.md', 'a/b/c.md', true],
    ['**', 'anything/at/all', true],
    ['a/**', 'a/b', true],
    ['a/**', 'a/b/c/d', true],
    ['a/**', 'b/a/c', false],
    // `*` は 1 階層の中だけ。`/` を越えない
    ['docs/*.md', 'docs/a.md', true],
    ['docs/*.md', 'docs/sub/a.md', false],
    ['*.json', '.igeta.json', true], // 先頭が `.` の名前にも当たる (門は見落とすより多く拾う)
    ['**/*', '.github/workflows/ci.yml', true],
    ['docs/?.md', 'docs/a.md', true],
    ['docs/?.md', 'docs/ab.md', false],
    // 文字クラスと否定
    ['f[a-c].txt', 'fb.txt', true],
    ['f[a-c].txt', 'fd.txt', false],
    ['f[!a-c].txt', 'fd.txt', true],
    ['f[^a-c].txt', 'fa.txt', false],
    ['f[-a].txt', 'f-.txt', true],
    // 選択肢
    ['docs/{person,client}/**', 'docs/client/x.md', true],
    ['docs/{person,client}/**', 'docs/ai/x.md', false],
    ['src/{checks,gate}/**/*.ts', 'src/gate/deep/X.ts', true],
    ['{a,b}/{c,d}.md', 'b/c.md', true],
    ['{a,b}/{c,d}.md', 'a/e.md', false],
    ['x{,-y}.md', 'x.md', true],
    ['x{,-y}.md', 'x-y.md', true],
    // 日本語の名前・正規表現の特殊文字は文字として扱う
    ['docs/読み手/*.md', 'docs/読み手/はじめに.md', true],
    ['a.b/c+d/(e).md', 'a.b/c+d/(e).md', true],
    ['a.b/c+d/(e).md', 'axb/c+d/(e).md', false],
    // 大文字小文字は区別しない (大文字小文字を区別しないファイルシステムでは同じ場所になる)
    ['docs/person/**', 'docs/Person/x.md', true],
    ['docs/person/**', 'DOCS/PERSON/x.md', true],
    ['.github/CODEOWNERS', '.GitHub/codeowners', true],
    ['docs/[a-c]*/x.md', 'docs/Person/x.md', false], // 文字クラスも同じ扱い (P は a-c の外)
    ['docs/[a-p]*/x.md', 'docs/Person/x.md', true],
    // glob が手前のディレクトリに当たれば、その配下のパスにも当たる (ディレクトリ名だけを書いても何にも当たらない設定にならない)
    ['docs/special', 'docs/special/x.md', true],
    ['docs/special', 'docs/special/sub/y.md', true],
    ['docs/special', 'docs/special', true],
    ['docs/special', 'docs/specialist/x.md', false],
    ['docs/special', 'docs', false],
    ['src', 'src/a/b.ts', true],
    ['docs/*.md', 'docs/sub/a.md', false], // `*.md` はディレクトリ `sub` に当たらないので配下にも届かない
  ];
  for (const [pattern, path, expected] of cases) {
    it(`${pattern} ${expected ? 'は当たる' : 'は当たらない'}: ${path}`, () => {
      assert.equal(matchesGlob(path, pattern), expected);
    });
  }
});

describe('validateGlob', () => {
  const valid = [
    'templates/**',
    'docs/explanation/0[3-9]-*.md',
    'docs/{person,client}/**',
    'a/**/b',
    '*.json',
    '.github/workflows/**',
    'docs/a b/c.md',
    'docs/foo (1).md', // `(` の直前が extglob の記号でなければ文字
    'docs/special', // ディレクトリ名だけ (配下にも当たる)
  ];
  for (const pattern of valid) {
    it(`使える: ${pattern}`, () => {
      assert.equal(validateGlob(pattern), null);
    });
  }

  const invalid: ReadonlyArray<readonly [pattern: string, reason: RegExp]> = [
    ['', /空/],
    ['   ', /空/],
    [' src/gate/**', /前後に空白/],
    ['src/gate/** ', /前後に空白/],
    ['!docs/**', /否定/],
    ['/templates/**', /先頭の/],
    ['./templates/**', /先頭の/],
    ['templates/', /末尾の/],
    ['docs\\x', /エスケープ/],
    ['docs/../x', /`\.\.`/],
    ['docs/./x', /`\.`/],
    ['docs//x', /空の階層/],
    ['docs/+(a|b)/x', /extglob/],
    ['docs/!(a)/x', /extglob/],
    ['docs/[abc/x', /`\[` に対応する/],
    ['docs/[]/x', /文字クラス `\[\]` が空/],
    ['docs/[z-a]/x', /範囲が不正/],
    ['docs/[[:alpha:]]/x', /`\[:alpha:\]`/],
    ['docs/{a,b/x', /`\{` に対応する/],
    ['docs/a,b}/x', /`\}` に対応する/],
    ['docs/}a{/x', /`\}` に対応する/],
    ['docs/{a}/x', /選択肢/],
    ['docs/{1..3}/x', /選択肢/],
    ['docs/\nx', /制御文字/],
  ];
  for (const [pattern, reason] of invalid) {
    it(`使えない: ${JSON.stringify(pattern)}`, () => {
      const message = validateGlob(pattern);
      assert.notEqual(message, null);
      assert.match(message ?? '', reason);
    });
  }

  it('選択肢の展開が多すぎる glob は使えない', () => {
    const pattern = Array.from({ length: 5 }, () => '{a,b,c,d}').join('/'); // 4^5 = 1024 通り
    assert.match(validateGlob(pattern) ?? '', /多すぎる/);
  });
});

describe('globCanMatchUnder', () => {
  const folders = ['docs/person', 'docs/ai', 'docs/client'] as const;

  it('3 フォルダの配下に当たりうる glob は全部のフォルダで true', () => {
    // 配下の「どの名前にも」合わせられる書き方と、1 本だけを指す書き方の両方
    const hitting = [
      'docs/**',
      '**',
      '**/*.md',
      'docs/*/**',
      'docs/*/*.md',
      'docs/[a-z]*/x.md',
      'docs/{person,ai,client}/**',
      'docs', // 手前のディレクトリに当たる glob は、配下の 3 フォルダにも当たる
      'd*',
      '*',
      'DOCS/*/X.MD', // 大文字小文字は区別しない
    ];
    for (const pattern of hitting) {
      for (const folder of folders) {
        assert.equal(globCanMatchUnder(pattern, folder), true, `${pattern} は ${folder} の配下に当たる`);
      }
    }
  });

  it('フォルダ名を直接書いた glob (ディレクトリ名そのもの・配下の 1 本だけ) も true', () => {
    assert.equal(globCanMatchUnder('docs/person', 'docs/person'), true);
    assert.equal(globCanMatchUnder('docs/person/**', 'docs/person'), true);
    assert.equal(globCanMatchUnder('docs/person/requirements/01-requirements.md', 'docs/person'), true);
    assert.equal(globCanMatchUnder('docs/p*/**', 'docs/person'), true);
    assert.equal(globCanMatchUnder('docs/ai/specs/**', 'docs/ai'), true);
    assert.equal(globCanMatchUnder('docs/client/delivery/*.md', 'docs/client'), true);
    assert.equal(globCanMatchUnder('docs/Person/**', 'docs/person'), true); // 大文字小文字だけを変えても拾う
    assert.equal(globCanMatchUnder('DOCS/AI', 'docs/ai'), true);
  });

  it('3 フォルダの外だけを指す glob は false', () => {
    const outside = [
      'docs/legacy/**',
      'docs/images/**',
      'docs/*.md', // docs 直下のファイルだけ。person/ 配下には届かない
      'docs/[x-z]*/**',
      'docs/ai-notes/**', // `ai` で始まっても `ai` そのものではない
      'docs/{legacy,images}/**',
      'src/**',
      '*.md',
      'docs.md',
      'doc*/x.md',
    ];
    for (const pattern of outside) {
      for (const folder of folders) {
        assert.equal(globCanMatchUnder(pattern, folder), false, `${pattern} は ${folder} の配下に当たらない`);
      }
    }
  });
});
