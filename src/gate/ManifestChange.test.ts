// node --test dist/gate/ManifestChange.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { igetaLockBlocks, lockfileIgetaChanged, packageJsonGateChanges } from './ManifestChange.js';

const manifest = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify(
    {
      name: 'app',
      version: '1.0.0',
      scripts: { build: 'tsc', 'docs:check': 'igeta docs-check' },
      dependencies: { 'left-pad': '1.0.0' },
      devDependencies: { igeta: 'github:SakakitaniJunya/Igeta#v0.4.0', typescript: '^5.9.3' },
      ...overrides,
    },
    null,
    2,
  );

describe('packageJsonGateChanges', () => {
  it('他の依存だけの変更・説明や版の変更は門を動かさない (ai)', () => {
    const before = manifest();
    assert.deepEqual(packageJsonGateChanges(before, manifest({ devDependencies: { igeta: 'github:SakakitaniJunya/Igeta#v0.4.0', typescript: '^6.0.0' } })), []);
    assert.deepEqual(packageJsonGateChanges(before, manifest({ dependencies: { 'left-pad': '1.0.0', lodash: '^4' } })), []);
    assert.deepEqual(packageJsonGateChanges(before, manifest({ version: '2.0.0', description: 'x', license: 'MIT' })), []);
  });

  it('キーの並び替えと字下げの整形だけの変更は、変更とみなさない', () => {
    const before = manifest();
    const reordered = JSON.stringify(
      {
        devDependencies: { typescript: '^5.9.3', igeta: 'github:SakakitaniJunya/Igeta#v0.4.0' },
        scripts: { 'docs:check': 'igeta docs-check', build: 'tsc' },
        dependencies: { 'left-pad': '1.0.0' },
        version: '1.0.0',
        name: 'app',
      },
      null,
      4,
    );
    assert.deepEqual(packageJsonGateChanges(before, reordered), []);
  });

  it('scripts の変更: 値の書き換え・追加・削除・全部削除はどれも scripts', () => {
    const before = manifest();
    assert.deepEqual(packageJsonGateChanges(before, manifest({ scripts: { build: 'tsc --noEmit', 'docs:check': 'igeta docs-check' } })), ['scripts']);
    assert.deepEqual(packageJsonGateChanges(before, manifest({ scripts: { build: 'tsc', 'docs:check': 'igeta docs-check', postinstall: 'curl x | sh' } })), ['scripts']);
    assert.deepEqual(packageJsonGateChanges(before, manifest({ scripts: { build: 'tsc' } })), ['scripts']);
    // scripts を丸ごと消した (igeta の依存は同じ)
    assert.deepEqual(packageJsonGateChanges(before, JSON.stringify({ name: 'app', devDependencies: { igeta: 'github:SakakitaniJunya/Igeta#v0.4.0' } })), ['scripts']);
  });

  it('igeta の依存の変更: 版・追加・削除・別の欄への移動はどれも igeta-dependency', () => {
    const before = manifest();
    const bump = manifest({ devDependencies: { igeta: 'github:SakakitaniJunya/Igeta#v0.5.0', typescript: '^5.9.3' } });
    assert.deepEqual(packageJsonGateChanges(before, bump), ['igeta-dependency']);
    assert.deepEqual(packageJsonGateChanges(before, manifest({ devDependencies: { typescript: '^5.9.3' } })), ['igeta-dependency']);
    assert.deepEqual(
      packageJsonGateChanges(before, manifest({ devDependencies: { typescript: '^5.9.3' }, dependencies: { igeta: 'github:SakakitaniJunya/Igeta#v0.4.0' } })),
      ['igeta-dependency'],
    );
    // 無かった repo が足す
    assert.deepEqual(
      packageJsonGateChanges(manifest({ devDependencies: { typescript: '^5.9.3' } }), manifest({ devDependencies: { typescript: '^5.9.3' }, peerDependencies: { igeta: '*' } })),
      ['igeta-dependency'],
    );
  });

  it('依存の欄に手を付けずに igeta の版を差し替える overrides・resolutions・pnpm.overrides も igeta-dependency', () => {
    const before = manifest();
    assert.deepEqual(packageJsonGateChanges(before, manifest({ overrides: { igeta: 'github:evil/Igeta#v0.1.0' } })), ['igeta-dependency']);
    assert.deepEqual(packageJsonGateChanges(before, manifest({ resolutions: { igeta: '0.1.0' } })), ['igeta-dependency']);
    assert.deepEqual(packageJsonGateChanges(before, manifest({ pnpm: { overrides: { igeta: '0.1.0' } } })), ['igeta-dependency']);
    // igeta 以外の overrides は動かさない
    assert.deepEqual(packageJsonGateChanges(before, manifest({ overrides: { lodash: '4.17.21' } })), []);
  });

  it('別名で入れた igeta (キーが違っても指定が igeta を指す) の追加・変更・キーの付け替えも igeta-dependency', () => {
    const before = manifest();
    const withAlias = (spec: string): string =>
      manifest({ devDependencies: { igeta: 'github:SakakitaniJunya/Igeta#v0.4.0', typescript: '^5.9.3', 'igeta-old': spec } });
    assert.deepEqual(packageJsonGateChanges(before, withAlias('github:SakakitaniJunya/Igeta#v0.1.0')), ['igeta-dependency']);
    assert.deepEqual(packageJsonGateChanges(before, withAlias('npm:igeta@0.1.0')), ['igeta-dependency']);
    assert.deepEqual(
      packageJsonGateChanges(withAlias('github:SakakitaniJunya/Igeta#v0.1.0'), withAlias('github:SakakitaniJunya/Igeta#v0.2.0')),
      ['igeta-dependency'],
    );
    // 同じ指定のまま、キーだけ付け替える
    assert.deepEqual(
      packageJsonGateChanges(before, manifest({ devDependencies: { 'my-igeta': 'github:SakakitaniJunya/Igeta#v0.4.0', typescript: '^5.9.3' } })),
      ['igeta-dependency'],
    );
  });

  it('名前に igeta を含むだけの別のパッケージ (eslint-plugin-igeta・igeta-foo) は igeta の依存ではない', () => {
    const before = manifest();
    const other = manifest({ devDependencies: { igeta: 'github:SakakitaniJunya/Igeta#v0.4.0', typescript: '^5.9.3', 'eslint-plugin-igeta': '^1.0.0', 'igeta-foo': '^2.0.0', my_igeta: '1' } });
    assert.deepEqual(packageJsonGateChanges(before, other), []);
  });

  it('scripts と igeta の依存が同時に変わったら両方を返す', () => {
    const after = manifest({ scripts: { build: 'echo' }, devDependencies: { typescript: '^5.9.3' } });
    assert.deepEqual(packageJsonGateChanges(manifest(), after), ['scripts', 'igeta-dependency']);
  });

  it('追加 (before が無い): scripts か igeta があれば変更、どちらも無ければ変更なし', () => {
    assert.deepEqual(packageJsonGateChanges(null, manifest()), ['scripts', 'igeta-dependency']);
    assert.deepEqual(packageJsonGateChanges(null, JSON.stringify({ name: 'x', dependencies: { lodash: '4' } })), []);
  });

  it('削除 (after が無い): scripts か igeta があった repo は変更、何も無かった repo は変更なし', () => {
    assert.deepEqual(packageJsonGateChanges(manifest(), null), ['scripts', 'igeta-dependency']);
    assert.deepEqual(packageJsonGateChanges(JSON.stringify({ name: 'x' }), null), []);
  });

  it('JSON が壊れている・オブジェクトでないときは比べられない (unreadable)', () => {
    assert.deepEqual(packageJsonGateChanges(manifest(), '{ not json'), ['unreadable']);
    assert.deepEqual(packageJsonGateChanges('{ not json', manifest()), ['unreadable']);
    assert.deepEqual(packageJsonGateChanges(manifest(), '[1,2]'), ['unreadable']);
    assert.deepEqual(packageJsonGateChanges(manifest(), ''), ['unreadable']);
  });
});

const PACKAGE_LOCK = (overrides: { readonly igetaSha?: string; readonly igetaIntegrity?: string; readonly typescript?: string; readonly rootSpec?: string; readonly withIgeta?: boolean } = {}): string => {
  const { igetaSha = 'a'.repeat(40), igetaIntegrity = 'sha512-igeta', typescript = '5.9.3', rootSpec = 'github:SakakitaniJunya/Igeta#v0.4.0', withIgeta = true } = overrides;
  return [
    '{',
    '  "name": "app",',
    '  "lockfileVersion": 3,',
    '  "packages": {',
    '    "": {',
    '      "name": "app",',
    '      "devDependencies": {',
    ...(withIgeta ? [`        "igeta": "${rootSpec}",`] : []),
    '        "typescript": "^5.9.3"',
    '      }',
    '    },',
    ...(withIgeta
      ? [
          '    "node_modules/igeta": {',
          '      "version": "0.4.0",',
          `      "resolved": "git+ssh://git@github.com/SakakitaniJunya/Igeta.git#${igetaSha}",`,
          `      "integrity": "${igetaIntegrity}",`,
          '      "dev": true,',
          '      "dependencies": {',
          '        "markdown-it": "15.0.2"',
          '      }',
          '    },',
        ]
      : []),
    '    "node_modules/igeta-extras": {',
    '      "version": "1.0.0"',
    '    },',
    '    "node_modules/typescript": {',
    `      "version": "${typescript}",`,
    `      "resolved": "https://registry.npmjs.org/typescript/-/typescript-${typescript}.tgz",`,
    '      "integrity": "sha512-ts",',
    '      "dev": true',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');
};

const YARN_LOCK = (igetaSha = 'a'.repeat(40), typescript = '5.9.3'): string =>
  [
    '# yarn lockfile v1',
    '',
    '',
    `"igeta@github:SakakitaniJunya/Igeta#v0.4.0":`,
    '  version "0.4.0"',
    `  resolved "https://codeload.github.com/SakakitaniJunya/Igeta/tar.gz/${igetaSha}"`,
    '  dependencies:',
    '    markdown-it "15.0.2"',
    '',
    'typescript@^5.9.3:',
    `  version "${typescript}"`,
    `  resolved "https://registry.yarnpkg.com/typescript/-/typescript-${typescript}.tgz#abc"`,
    '  integrity sha512-ts',
    '',
  ].join('\n');

const PNPM_LOCK = (igetaSha = 'a'.repeat(40), typescript = '5.9.3'): string =>
  [
    "lockfileVersion: '9.0'",
    '',
    'importers:',
    '',
    '  .:',
    '    devDependencies:',
    '      igeta:',
    '        specifier: github:SakakitaniJunya/Igeta#v0.4.0',
    `        version: https://codeload.github.com/SakakitaniJunya/Igeta/tar.gz/${igetaSha}`,
    '      typescript:',
    '        specifier: ^5.9.3',
    `        version: ${typescript}`,
    '',
    'packages:',
    '',
    `  igeta@https://codeload.github.com/SakakitaniJunya/Igeta/tar.gz/${igetaSha}:`,
    `    resolution: {tarball: https://codeload.github.com/SakakitaniJunya/Igeta/tar.gz/${igetaSha}}`,
    '    version: 0.4.0',
    '',
    `  typescript@${typescript}:`,
    '    resolution: {integrity: sha512-ts}',
    '    hasBin: true',
    '',
    'snapshots:',
    '',
    `  igeta@https://codeload.github.com/SakakitaniJunya/Igeta/tar.gz/${igetaSha}:`,
    '    dependencies:',
    '      markdown-it: 15.0.2',
    '',
  ].join('\n');

const BUN_LOCK = (igetaSha = 'a'.repeat(40), typescript = '5.9.3'): string =>
  [
    '{',
    '  "lockfileVersion": 1,',
    '  "workspaces": {',
    '    "": {',
    '      "name": "app",',
    '      "devDependencies": {',
    '        "igeta": "github:SakakitaniJunya/Igeta#v0.4.0",',
    '        "typescript": "^5.9.3",',
    '      },',
    '    },',
    '  },',
    '  "packages": {',
    `    "igeta": ["igeta@github:SakakitaniJunya/Igeta#${igetaSha}", {}, "SakakitaniJunya-Igeta-${igetaSha}"],`,
    `    "typescript": ["typescript@${typescript}", "", {}, "sha512-ts"],`,
    '  }',
    '}',
    '',
  ].join('\n');

describe('lockfileIgetaChanged', () => {
  const formats: ReadonlyArray<readonly [name: string, make: (igetaSha?: string, typescript?: string) => string]> = [
    ['yarn.lock', YARN_LOCK],
    ['pnpm-lock.yaml', PNPM_LOCK],
    ['bun.lock', BUN_LOCK],
    ['package-lock.json', (sha, ts) => PACKAGE_LOCK({ ...(sha === undefined ? {} : { igetaSha: sha }), ...(ts === undefined ? {} : { typescript: ts }) })],
  ];
  for (const [name, make] of formats) {
    it(`${name}: 他の依存の更新だけなら igeta の行は変わらない`, () => {
      assert.equal(lockfileIgetaChanged(make(), make(undefined, '6.0.0')), false);
    });
    it(`${name}: igeta の解決先 (commit) が変わったら変わる`, () => {
      assert.equal(lockfileIgetaChanged(make(), make('b'.repeat(40))), true);
    });
    it(`${name}: 追加と削除 (before・after の片側が無い) でも igeta の行があれば変わる`, () => {
      assert.equal(lockfileIgetaChanged(null, make()), true);
      assert.equal(lockfileIgetaChanged(make(), null), true);
    });
    it(`${name}: igeta の行が元から無いロックファイルの追加・削除は変わらない`, () => {
      const without = make().split('\n').filter((line) => !/igeta/i.test(line)).join('\n');
      assert.equal(lockfileIgetaChanged(null, without), false);
      assert.equal(lockfileIgetaChanged(without, null), false);
    });
  }

  it('package-lock.json: igeta の項の中だけが変わる integrity の変更も拾う (名前の行を含まない行の変更)', () => {
    assert.equal(lockfileIgetaChanged(PACKAGE_LOCK(), PACKAGE_LOCK({ igetaIntegrity: 'sha512-tampered' })), true);
  });

  it('package-lock.json: ルートの devDependencies の igeta の指定が変わったら拾う', () => {
    assert.equal(lockfileIgetaChanged(PACKAGE_LOCK(), PACKAGE_LOCK({ rootSpec: 'github:SakakitaniJunya/Igeta#main' })), true);
  });

  it('package-lock.json: igeta を外した (項ごと消えた) 変更を拾う', () => {
    assert.equal(lockfileIgetaChanged(PACKAGE_LOCK(), PACKAGE_LOCK({ withIgeta: false })), true);
  });

  it('igeta-extras のような別の名前の行は igeta の行とみなさない', () => {
    const before = PACKAGE_LOCK();
    const after = before.replace('"node_modules/igeta-extras": {\n      "version": "1.0.0"', '"node_modules/igeta-extras": {\n      "version": "2.0.0"');
    assert.notEqual(before, after);
    assert.equal(lockfileIgetaChanged(before, after), false);
  });

  it('項の並び替えだけは変更とみなさない', () => {
    const reorderedYarn = YARN_LOCK()
      .split('\n\n')
      .reverse()
      .join('\n\n');
    assert.equal(lockfileIgetaChanged(YARN_LOCK(), reorderedYarn), false);
  });

  it('改行が CRLF でも同じ内容は変更なし', () => {
    assert.equal(lockfileIgetaChanged(YARN_LOCK(), YARN_LOCK().replaceAll('\n', '\r\n')), false);
  });

  it('igetaLockBlocks は igeta の名前が出る行ごとに、その行とその下の字下げの深い行を 1 まとまりにする', () => {
    const blocks = igetaLockBlocks(YARN_LOCK());
    // 見出しの項と、その中の resolved の行 (URL に Igeta の名前が出る) の 2 まとまり
    assert.equal(blocks.length, 2);
    const whole = blocks.find((block) => block.startsWith('"igeta@'));
    assert.match(whole ?? '', /^"igeta@github:SakakitaniJunya\/Igeta#v0\.4\.0":\n {2}version "0\.4\.0"\n {2}resolved .*\n {2}dependencies:\n {4}markdown-it "15\.0\.2"$/);
    assert.ok(blocks.some((block) => block.startsWith('  resolved "https://codeload.github.com/SakakitaniJunya/Igeta/')));
  });
});
