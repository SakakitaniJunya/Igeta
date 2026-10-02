// node --test dist/gate/ApprovalScopeCommand.test.js
// approval-scope の宛先の指定と、検査不能 (R3・R4)。テスト仕様 01 の表の行に 1 本ずつ対応する。
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IGETA_ROOT } from '../core/Paths.js';
import {
  BASE_FILES,
  TestRepo,
  assertCannotCheck,
  fakeGit,
  gitIn,
  scope,
  tempDir,
  withOrigin,
} from './ApprovalScopeFixture.js';

const CI = { env: { GITHUB_BASE_REF: 'main' } } as const;

describe('approval-scope: 宛先の指定 (R3)', () => {
  it('[TST-305] --ci と --base を同時に指定する・どちらも指定しないと、検査不能', async () => {
    const { repo } = withOrigin(BASE_FILES);
    repo.branch();
    assertCannotCheck(await scope(['--ci', '--base', 'HEAD'], repo.root, CI), /同時に指定できない/);
    assertCannotCheck(await scope([], repo.root, CI), /--ci か --base <ref> のどちらかが要る/);
  });
});

describe('approval-scope: 配線 (R6)', () => {
  it('[TST-108] build した dist/cli.js を実プロセスで回すと、approval-scope --ci の終了コードは 0・1・2。doctor が登録されている', () => {
    const cli = join(IGETA_ROOT, 'dist', 'cli.js');
    const igeta = (args: readonly string[], cwd: string, env: Readonly<Record<string, string>>) =>
      spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
    const { repo } = withOrigin(BASE_FILES);
    repo.branch();

    repo.touch('src/index.ts');
    repo.commit('ai の変更');
    const ai = igeta(['approval-scope', '--ci'], repo.root, { GITHUB_BASE_REF: 'main' });
    assert.equal(ai.status, 0, ai.stderr);
    assert.equal(ai.stdout.split('\n')[0], 'ai');

    repo.touch('docs/person/requirements/01-requirements.md');
    repo.commit('人の変更');
    const human = igeta(['approval-scope', '--ci'], repo.root, { GITHUB_BASE_REF: 'main' });
    assert.equal(human.status, 1, human.stderr);
    assert.deepEqual(human.stdout.split('\n').slice(0, 2), ['human', '- docs/person/requirements/01-requirements.md (docs/person/ の文書)']);

    const unresolved = igeta(['approval-scope', '--ci'], repo.root, { GITHUB_BASE_REF: '' });
    assert.equal(unresolved.status, 2);
    assert.equal(unresolved.stdout, '');
    assert.match(unresolved.stderr, /^CANNOT-CHECK /);

    const doctor = igeta(['doctor', '--help'], repo.root, {});
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.match(doctor.stdout, /^igeta doctor — /);
  });
});

describe('approval-scope: 検査不能 (R4)', () => {
  it('[TST-306] --ci で宛先が決まらない (環境変数なし・origin/<名前> なし・共通の祖先なし・名前が - で始まる・名前が式や特別な名前) と、検査不能', async () => {
    const { repo, origin } = withOrigin(BASE_FILES);
    repo.branch();
    repo.touch('src/index.ts');
    repo.commit();
    assertCannotCheck(await scope(['--ci'], repo.root), /GITHUB_BASE_REF/, '環境変数なし');
    assertCannotCheck(
      await scope(['--ci'], repo.root, { env: { GITHUB_BASE_REF: 'release' } }),
      /refs\/remotes\/origin\/release が無い/,
      'origin/<名前> なし',
    );
    // 名前が - で始まる・式 (main~1・@{-1})・特別な名前 (HEAD)。origin/HEAD は宛先の既定ブランチを指すので、実在させて確かめる
    repo.git('remote', 'set-head', 'origin', 'main');
    for (const name of ['-x', 'main~1', '@{-1}', 'HEAD']) {
      assertCannotCheck(await scope(['--ci'], repo.root, { env: { GITHUB_BASE_REF: name } }), /ref として正しくない/, `名前 ${name}`);
    }

    // 浅い clone: HEAD の履歴と宛先の履歴が、手元ではつながらない
    repo.git('push', '-q', 'origin', 'feature');
    const shallow = tempDir('igeta-approval-scope-shallow-');
    gitIn(shallow, 'clone', '-q', '--depth', '1', '--branch', 'feature', `file://${origin}`, '.');
    gitIn(shallow, 'fetch', '-q', '--depth', '1', 'origin', 'main:refs/remotes/origin/main');
    assertCannotCheck(await scope(['--ci'], shallow, CI), /共通の祖先が無く/, '浅い clone');
  });

  it('[TST-308] git の repo でないフォルダ・repo の最上位でない --root は、検査不能', async () => {
    const notGit = tempDir('igeta-approval-scope-nogit-');
    mkdirSync(join(notGit, 'docs', 'person'), { recursive: true });
    assertCannotCheck(await scope(['--base', 'main'], notGit), /git rev-parse --show-toplevel が失敗した/, 'git の外');

    const repo = TestRepo.create({ ...BASE_FILES, 'sub/docs/person/x.md': '# x\n' });
    assertCannotCheck(await scope(['--base', 'main', '--root', join(repo.root, 'sub')], repo.root), /最上位ではない/, '部分木');
  });

  it('[TST-311] 宛先の .igeta.json が壊れている・glob が不正・差分の状態の文字が想定外 (U) だと、検査不能', async () => {
    const brokenConfigs: ReadonlyArray<readonly [name: string, content: string, message: RegExp]> = [
      ['JSON でない', '{ not json', /JSON が壊れている/],
      ['humanPaths の glob が不正', JSON.stringify({ humanPaths: ['!src/**'] }), /glob として使えない/],
    ];
    for (const [name, content, message] of brokenConfigs) {
      const repo = TestRepo.create({ ...BASE_FILES, '.igeta.json': content });
      repo.branch();
      repo.touch('src/index.ts');
      repo.commit();
      assertCannotCheck(await scope(['--base', 'main'], repo.root), message, name);
    }

    // git の差分の出力に、状態の文字 U (未解決) が混ざる
    const repo = TestRepo.create(BASE_FILES);
    repo.branch();
    repo.touch('src/index.ts');
    repo.commit();
    const withUnmerged = fakeGit((args) => {
      if (!args.includes('--name-status')) return undefined;
      return { status: 0, stdout: 'U\0docs/ai/x.md\0', stderr: '' };
    });
    assertCannotCheck(await scope(['--base', 'main'], repo.root, { git: withUnmerged }), /状態の文字が想定外: "U"/, '状態の文字 U');
  });

  it('[TST-315] merge が衝突する・git が merge-tree --write-tree を持たない・宛先の .igeta.json を読み出せない、と検査不能', async () => {
    // 宛先と HEAD が同じ行を別々に変える
    const conflicting = TestRepo.create({ ...BASE_FILES, 'src/index.ts': 'a\nb\nc\n' });
    conflicting.branch();
    conflicting.write('src/index.ts', 'a\nb (枝)\nc\n');
    conflicting.commit('枝の変更');
    conflicting.checkout('main');
    conflicting.write('src/index.ts', 'a\nb (宛先)\nc\n');
    conflicting.commit('宛先の変更');
    conflicting.checkout('feature');
    assertCannotCheck(await scope(['--base', 'main'], conflicting.root), /merge が衝突する/, '衝突');

    const repo = TestRepo.create(BASE_FILES);
    repo.branch();
    repo.touch('src/index.ts');
    repo.commit();
    const withoutMergeTree = fakeGit((args) =>
      args[0] === 'merge-tree' ? { status: 129, stdout: '', stderr: 'usage: git merge-tree <base-tree> <branch1> <branch2>' } : undefined,
    );
    assertCannotCheck(await scope(['--base', 'main'], repo.root, { git: withoutMergeTree }), /merge-tree --write-tree が使えない/, 'merge-tree なし');

    // 宛先のツリーに .igeta.json はある (ls-tree が返す) のに、読み出しに失敗する
    const unreadable = fakeGit((args) =>
      args[0] === 'show' ? { status: 128, stdout: '', stderr: 'fatal: unable to read blob' } : undefined,
    );
    assertCannotCheck(await scope(['--base', 'main'], repo.root, { git: unreadable }), /git show .*\.igeta\.json が失敗した/, '読み出し失敗');
  });
});
