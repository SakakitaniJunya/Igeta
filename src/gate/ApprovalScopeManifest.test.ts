// node --test dist/gate/ApprovalScopeManifest.test.js
// approval-scope: package.json とロックファイルは、scripts と igeta の行が変わったときだけ human (ADR-0008 決定 1)。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ScopeJudgement } from './ApprovalScope.js';
import { BASE, BUN_LOCK, PACKAGE_JSON, PACKAGE_LOCK, PNPM_LOCK, YARN_LOCK, change, packageJsonWith, without } from './ApprovalScopeFixture.js';

describe('package.json: scripts と igeta の依存だけが門を動かす', () => {
  const pkg = async (content: string): Promise<ScopeJudgement> => change((repo) => repo.write('package.json', content));

  it('scripts の変更は human', async () => {
    const result = await pkg(packageJsonWith({ scripts: { build: 'tsc --noEmit', 'docs:check': 'igeta docs-check' } }));
    assert.equal(result.verdict, 'human');
    assert.deepEqual(result.reasons, [{ path: 'package.json', rule: 'package.json の scripts が変わった' }]);
  });

  it('scripts の追加・削除も human', async () => {
    assert.equal((await pkg(packageJsonWith({ scripts: { build: 'tsc', 'docs:check': 'igeta docs-check', postinstall: 'curl x | sh' } }))).verdict, 'human');
    assert.equal((await pkg(packageJsonWith({ scripts: { build: 'tsc' } }))).verdict, 'human');
    const withoutScripts = Object.fromEntries(Object.entries(JSON.parse(PACKAGE_JSON) as Record<string, unknown>).filter(([key]) => key !== 'scripts'));
    assert.equal((await pkg(JSON.stringify(withoutScripts))).verdict, 'human');
  });

  it('igeta の依存の版・追加先の欄・削除は human', async () => {
    const igeta = { igeta: 'github:SakakitaniJunya/Igeta#v0.5.0', typescript: '^5.9.3' };
    const bump = await pkg(packageJsonWith({ devDependencies: igeta }));
    assert.equal(bump.verdict, 'human');
    assert.deepEqual(bump.reasons, [{ path: 'package.json', rule: 'package.json の igeta の依存が変わった' }]);
    assert.equal((await pkg(packageJsonWith({ devDependencies: { typescript: '^5.9.3' } }))).verdict, 'human');
    assert.equal(
      (await pkg(packageJsonWith({ devDependencies: { typescript: '^5.9.3' }, dependencies: { 'left-pad': '1.0.0', igeta: 'github:SakakitaniJunya/Igeta#v0.4.0' } }))).verdict,
      'human',
    );
  });

  it('overrides で igeta の版を差し替えるのも human', async () => {
    assert.equal((await pkg(packageJsonWith({ overrides: { igeta: 'github:evil/Igeta#v0.1.0' } }))).verdict, 'human');
  });

  it('他の依存だけの変更は ai (追加・版の変更・削除)', async () => {
    const result = await change((repo) => {
      repo.write(
        'package.json',
        packageJsonWith({
          version: '1.1.0',
          dependencies: { 'left-pad': '2.0.0', lodash: '^4.17.21' },
          devDependencies: { igeta: 'github:SakakitaniJunya/Igeta#v0.4.0', typescript: '^6.0.0', vitest: '^3' },
        }),
      );
    });
    assert.equal(result.verdict, 'ai');
    assert.deepEqual(result.reasons, []);
    assert.equal(result.changedCount, 1);
    assert.equal((await pkg(packageJsonWith({ dependencies: {} }))).verdict, 'ai');
  });

  it('キーの並び替え・字下げの整形だけは ai', async () => {
    const reverse = (value: unknown): unknown =>
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse().map(([key, v]) => [key, reverse(v)]))
        : value;
    assert.equal((await pkg(JSON.stringify(reverse(JSON.parse(PACKAGE_JSON)), null, '\t'))).verdict, 'ai');
  });

  it('JSON が壊れた package.json は比べられないので human (ai に倒さない)', async () => {
    const result = await pkg('{ "scripts": ');
    assert.equal(result.verdict, 'human');
    assert.match(result.reasons[0]?.rule ?? '', /比べられない/);
  });

  it('package.json の削除は human、scripts も igeta も無い package.json の追加は ai', async () => {
    assert.equal((await change((repo) => repo.remove('package.json'))).verdict, 'human');
    const files = without('package.json', 'package-lock.json');
    const noScripts = await change((repo) => repo.write('package.json', JSON.stringify({ name: 'x', dependencies: { lodash: '4' } })), files);
    assert.equal(noScripts.verdict, 'ai');
    const withScripts = await change((repo) => repo.write('package.json', JSON.stringify({ name: 'x', scripts: { start: 'node x' } })), files);
    assert.equal(withScripts.verdict, 'human');
  });

  it('入れ子の package.json (packages/*/package.json) は見ない (ADR は repo 直下の package.json)', async () => {
    const result = await change((repo) => repo.write('packages/a/package.json', JSON.stringify({ scripts: { build: 'x' } })));
    assert.equal(result.verdict, 'ai');
  });
});

describe('ロックファイル: igeta の行が変わったときだけ human', () => {
  const lockfiles: ReadonlyArray<readonly [name: string, make: (igetaSha?: string, typescript?: string) => string]> = [
    ['package-lock.json', (sha, ts) => PACKAGE_LOCK(sha, ts)],
    ['yarn.lock', YARN_LOCK],
    ['pnpm-lock.yaml', PNPM_LOCK],
    ['bun.lock', BUN_LOCK],
  ];
  for (const [name, make] of lockfiles) {
    const files = { ...BASE, [name]: make() };
    it(`${name}: 他の依存の更新だけなら ai`, async () => {
      const result = await change((repo) => repo.write(name, make(undefined, '6.0.0')), files);
      assert.equal(result.verdict, 'ai');
      assert.equal(result.changedCount, 1);
    });
    it(`${name}: igeta の行が変わったら human`, async () => {
      const result = await change((repo) => repo.write(name, make('b'.repeat(40))), files);
      assert.equal(result.verdict, 'human');
      assert.deepEqual(result.reasons, [{ path: name, rule: 'ロックファイルの igeta の行が変わった' }]);
    });
  }

  it('package-lock.json: igeta の項の中だけが変わる (integrity) 変更も human', async () => {
    const result = await change((repo) => repo.write('package-lock.json', PACKAGE_LOCK(undefined, undefined, 'sha512-tampered')));
    assert.equal(result.verdict, 'human');
  });

  it('バイナリのロックファイル (bun.lockb) は igeta の行を見分けられないので、変わったら human', async () => {
    const files = { ...BASE, 'bun.lockb': Buffer.from([0, 1, 2, 3]) };
    const result = await change((repo) => repo.write('bun.lockb', Buffer.from([0, 1, 2, 4])), files);
    assert.equal(result.verdict, 'human');
    assert.match(result.reasons[0]?.rule ?? '', /バイナリのロックファイル/);
  });

  it('package.json の他の依存の更新と、ロックファイルの他の依存の更新が揃っていれば ai (通常の依存更新 PR)', async () => {
    const result = await change((repo) => {
      repo.write('package.json', packageJsonWith({ dependencies: { 'left-pad': '2.0.0' } }));
      repo.write('package-lock.json', PACKAGE_LOCK(undefined, '5.9.4'));
    });
    assert.equal(result.verdict, 'ai');
    assert.equal(result.changedCount, 2);
  });
});
