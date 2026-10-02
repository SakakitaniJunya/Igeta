// node --test dist/gate/ApprovalScope.test.js
// approval-scope の見分け。テスト仕様 01 (docs/design/test/specs/01-approval-gate.md) の表の行に 1 本ずつ対応する。
// 一時ディレクトリの本物の git repo で、変更を実際に commit して判定させる。
import { readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_FILES,
  TestRepo,
  assertAi,
  assertCannotCheck,
  assertHuman,
  reasonPaths,
  reasons,
  scope,
  withOrigin,
} from './ApprovalScopeFixture.js';

const PERSON_DOC = 'docs/person/requirements/01-requirements.md';
const CLIENT_DOC = 'docs/client/delivery/01-chapter.md';
const AI_DOC = 'docs/ai/specs/shared/01-spec.md';
const CI = { env: { GITHUB_BASE_REF: 'main' } } as const;

describe('approval-scope: 人の承認が要るパスの見分け', () => {
  it('[TST-101] ai の変更 (docs/ai/・src/・生成索引・package.json とロックファイル・差分なし) は ai・終了コード 0', async () => {
    const cases: ReadonlyArray<readonly [name: string, files: readonly string[]]> = [
      ['docs/ai/ の文書', [AI_DOC]],
      ['src/ のコード', ['src/index.ts']],
      ['docs/ 直下の生成索引', ['docs/README.md', 'docs/dependencies.md']],
      ['package.json とロックファイル', ['package.json', 'package-lock.json']],
      ['差分なし', []],
    ];
    for (const [name, files] of cases) {
      const repo = TestRepo.create(BASE_FILES);
      repo.branch();
      for (const file of files) repo.touch(file);
      if (files.length > 0) repo.commit();
      assertAi(await scope(['--base', 'main'], repo.root), name);
    }
  });

  it('[TST-102] person・client の文書を変えると human・終了コード 1。理由は人のパスだけ。出力の全文が R6 の形。改行を含む名前は JSON の文字列で出る', async () => {
    // 3 つ目は理由に出ない ai の文書、4 つ目は改行を含む名前: 理由の行は JSON の文字列になり、行が増えない (行を偽造できない)
    const cases: ReadonlyArray<readonly [name: string, files: readonly string[], reasonLines: readonly string[]]> = [
      ['person の文書 1 本', [PERSON_DOC], [`- ${PERSON_DOC} (docs/person/ の文書)`]],
      ['client の文書 1 本', [CLIENT_DOC], [`- ${CLIENT_DOC} (docs/client/ の文書)`]],
      ['ai と person の両方', [AI_DOC, PERSON_DOC], [`- ${PERSON_DOC} (docs/person/ の文書)`]],
      ['改行を含む名前の人のパス', ['docs/person/a\nhuman.md'], ['- "docs/person/a\\nhuman.md" (docs/person/ の文書)']],
    ];
    for (const [name, files, reasonLines] of cases) {
      const { repo } = withOrigin(BASE_FILES);
      repo.branch();
      for (const file of files) repo.touch(file);
      repo.commit();
      const tip = repo.git('rev-parse', 'main').slice(0, 12);
      const branchPoint = repo.git('merge-base', 'main', 'HEAD').slice(0, 12);
      const head = ['human', ...reasonLines, ''];

      // --base: 理由の行・空行・宛先の行のあとに、手元の確認用である旨の行
      const local = await scope(['--base', 'main'], repo.root);
      assert.equal(local.code, 1, name);
      assert.deepEqual(local.stdout.slice(0, -1), [...head, `宛先: main (${tip})・枝分かれの点: ${branchPoint}`], name);
      assert.match(local.stdout.at(-1) ?? '', /手元の確認用/, name);
      assert.deepEqual(local.stderr, [], name);

      // --ci: 宛先の行の末尾に (--ci)。その後ろに行は無い
      const ci = await scope(['--ci'], repo.root, CI);
      assert.equal(ci.code, 1, name);
      assert.deepEqual(ci.stdout, [...head, `宛先: origin/main (${tip})・枝分かれの点: ${branchPoint} (--ci)`], name);
      assert.deepEqual(ci.stderr, [], name);
    }
  });

  it('[TST-103] 決定 1 のファイルを 1 つずつ変えると、どれも human', async () => {
    const files = [
      '.github/workflows/x.yml',
      '.github/actions/a/action.yml',
      '.github/CODEOWNERS',
      'CODEOWNERS',
      'docs/CODEOWNERS',
      '.igeta.json',
      '.igeta-version',
      'AGENTS.md',
      'docs/ai/AGENTS.md',
      'CLAUDE.md',
      '.claude/settings.json',
    ];
    const repo = TestRepo.create(BASE_FILES);
    for (const file of files) {
      repo.checkout('main');
      repo.branch('one');
      repo.touch(file);
      repo.commit();
      assertHuman(await scope(['--base', 'main'], repo.root), [file], file);
      repo.checkout('main');
      repo.git('branch', '-q', '-D', 'one');
    }
  });

  it('[TST-104] 宛先の humanPaths に当たるパスを変えると human。理由に glob を添える', async () => {
    const repo = TestRepo.create({ ...BASE_FILES, '.igeta.json': JSON.stringify({ humanPaths: ['src/core/**'] }) });
    repo.branch();
    repo.touch('src/core/a.ts');
    repo.commit();
    const run = await scope(['--base', 'main'], repo.root);
    assertHuman(run, ['src/core/a.ts']);
    assert.equal(reasons(run)[0]?.rule, 'humanPaths: src/core/**');
  });

  it('[TST-105] 枝を切った後で宛先に足された humanPaths で見る (宛先の先端の設定)', async () => {
    const { repo } = withOrigin(BASE_FILES);
    repo.branch();
    repo.touch('src/core/a.ts');
    repo.commit('古い枝の変更');
    repo.checkout('main');
    repo.write('.igeta.json', JSON.stringify({ humanPaths: ['src/core/**'] }));
    repo.commit('宛先に humanPaths を足す');
    repo.git('push', '-q', 'origin', 'main');
    repo.checkout('feature');
    const run = await scope(['--ci'], repo.root, CI);
    assertHuman(run, ['src/core/a.ts']);
    assert.equal(reasons(run)[0]?.rule, 'humanPaths: src/core/**');
  });

  it('[TST-106] --base は作業ツリーと未追跡のファイルも含め、--ci は commit の内容だけを見る', async () => {
    const cases: ReadonlyArray<readonly [name: string, make: (repo: TestRepo) => void, path: string]> = [
      ['git add していない新しい人の文書', (repo) => repo.write('docs/person/new.md', '# new\n'), 'docs/person/new.md'],
      ['commit していない人の文書の書き換え', (repo) => repo.touch(PERSON_DOC), PERSON_DOC],
    ];
    for (const [name, make, path] of cases) {
      const { repo } = withOrigin(BASE_FILES);
      repo.branch();
      make(repo);
      assertHuman(await scope(['--base', 'main'], repo.root), [path], `${name} (--base)`);
      assertAi(await scope(['--ci'], repo.root, CI), `${name} (--ci)`);
    }
  });
});

describe('approval-scope: 否定テスト', () => {
  it('[TST-301] docs/person/x.md を docs/ai/x.md へ移すと human (削除の側のパスが当たる)', async () => {
    const repo = TestRepo.create(BASE_FILES);
    repo.branch();
    repo.move(PERSON_DOC, 'docs/ai/specs/shared/01-requirements.md');
    repo.commit();
    assertHuman(await scope(['--base', 'main'], repo.root), [PERSON_DOC]);
  });

  it('[TST-303] 宛先が旧い構成の repo で、変更が docs/ai/x.md を足しても、検査不能 (構成は宛先で決める)', async () => {
    const repo = TestRepo.create({ 'docs/design/basic/01-basic.md': '# 基本設計\n', 'src/index.ts': 'export {};\n' });
    repo.branch();
    repo.touch('docs/design/basic/01-basic.md'); // 旧い決定の文書の変更
    repo.write('docs/ai/x.md', '# x\n'); // 変更が ai/ を足して、新しい構成に見せかける
    repo.commit();
    assertCannotCheck(await scope(['--base', 'main'], repo.root), /旧い構成の repo/);
  });

  it('[TST-304] humanPaths を消し、そのパスを変える変更は human (理由は .igeta.json と、宛先の humanPaths)', async () => {
    const repo = TestRepo.create({ ...BASE_FILES, '.igeta.json': JSON.stringify({ humanPaths: ['src/core/**'] }) });
    repo.branch();
    repo.write('.igeta.json', '{}\n');
    repo.touch('src/core/a.ts');
    repo.commit();
    const run = await scope(['--base', 'main'], repo.root);
    assertHuman(run, ['.igeta.json', 'src/core/a.ts']);
    assert.equal(reasons(run).find((r) => r.path === 'src/core/a.ts')?.rule, 'humanPaths: src/core/**');
  });

  it('[TST-307] docs/person/design/README.md の生成区間の中に 1 行足すと human (README の例外は無い)', async () => {
    const repo = TestRepo.create(BASE_FILES);
    repo.branch();
    const readme = 'docs/person/design/README.md';
    repo.write(readme, readFileSync(join(repo.root, readme), 'utf8').replace('| 01 |', '| 01 |\n| 手書きの決まり |'));
    repo.commit();
    assertHuman(await scope(['--base', 'main'], repo.root), [readme]);
  });

  it('[TST-310] docs/person を symlink か submodule に置き換えると human (docs/person そのものも当たる)', async () => {
    for (const kind of ['symlink', 'submodule']) {
      const { repo } = withOrigin(BASE_FILES);
      repo.branch();
      repo.git('rm', '-rq', 'docs/person');
      if (kind === 'symlink') {
        symlinkSync('../ai', join(repo.root, 'docs/person'));
        repo.commit();
      } else {
        repo.git('update-index', '--add', '--cacheinfo', `160000,${repo.git('rev-parse', 'HEAD')},docs/person`);
        repo.git('commit', '-q', '-m', 'submodule');
      }
      const run = await scope(['--ci'], repo.root, CI);
      assertHuman(run, undefined, kind);
      assert.ok(reasonPaths(run).includes('docs/person'), `${kind}: ${reasonPaths(run).join(', ')}`);
    }
  });

  it('[TST-314] 宛先で docs/ai/x.md が docs/person/x.md へ移された後、その前に切った枝が docs/ai/x.md を編集すると human', async () => {
    const original = Array.from({ length: 12 }, (_, i) => `行 ${i + 1}`).join('\n') + '\n';
    const { repo } = withOrigin({ ...BASE_FILES, 'docs/ai/specs/shared/x.md': original });
    repo.branch();
    repo.write('docs/ai/specs/shared/x.md', original.replace('行 3', '行 3 (編集)'));
    repo.commit('古い枝が旧いパスを編集する');
    repo.checkout('main');
    repo.move('docs/ai/specs/shared/x.md', 'docs/person/design/shared/x.md');
    repo.commit('宛先で person へ移す');
    repo.git('push', '-q', 'origin', 'main');
    repo.checkout('feature');
    // 枝分かれの点から HEAD までには旧いパス (ai) しか出ないが、merge した結果の差分には移した先 (person) が出る
    assertHuman(await scope(['--ci'], repo.root, CI), ['docs/person/design/shared/x.md']);
  });

  it('[TST-316] 宛先の humanPaths がフォルダ名だけ (src/core) でも、配下の src/core/a.ts を変えると human (理由に glob)', async () => {
    const repo = TestRepo.create({ ...BASE_FILES, '.igeta.json': JSON.stringify({ humanPaths: ['src/core'] }) });
    repo.branch();
    repo.touch('src/core/a.ts');
    repo.commit();
    const run = await scope(['--base', 'main'], repo.root);
    assertHuman(run, ['src/core/a.ts']);
    assert.equal(reasons(run)[0]?.rule, 'humanPaths: src/core');
  });
});
