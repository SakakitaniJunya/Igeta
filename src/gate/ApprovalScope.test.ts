// node --test dist/gate/ApprovalScope.test.js
// approval-scope (ADR-0008) の判定そのもの: パスで決まる判定・差分の取り方・検査不能。
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IGETA_ROOT } from '../core/Paths.js';
import { judgeApprovalScope } from './ApprovalScope.js';
import { BASE, GATE_GLOBS, TestRepo, append, cannotCheckMessage, change, judge, judged, local, pathsOf, tempDir, without } from './ApprovalScopeFixture.js';

describe('ADR-0008 決定 1 の表: パスで決まる判定', () => {
  it('person/ だけの変更は human。理由はそのパス', async () => {
    const result = await change((repo) => append(repo, 'docs/person/requirements/01-requirements.md'));
    assert.equal(result.verdict, 'human');
    assert.deepEqual(result.reasons, [{ path: 'docs/person/requirements/01-requirements.md', rule: 'docs/person/ の文書' }]);
  });

  it('client/ だけの変更は human', async () => {
    const result = await change((repo) => append(repo, 'docs/client/delivery/01-chapter.md'));
    assert.equal(result.verdict, 'human');
    assert.deepEqual(result.reasons, [{ path: 'docs/client/delivery/01-chapter.md', rule: 'docs/client/ の文書' }]);
  });

  it('ai/ だけの変更 (コードも一緒) は ai。理由は空', async () => {
    const result = await change((repo) => {
      append(repo, 'docs/ai/specs/shared/01-spec.md');
      append(repo, 'docs/ai/handbook/how-to/01-howto.md');
      repo.write('docs/ai/specs/new-context/02-new.md', '# new\n');
      append(repo, 'src/index.ts');
      append(repo, 'README.md');
    });
    assert.equal(result.verdict, 'ai');
    assert.deepEqual(result.reasons, []);
    assert.equal(result.changedCount, 5);
  });

  it('person・client・ai の混在は human。理由には人の承認が要るパスだけを挙げる', async () => {
    const result = await change((repo) => {
      append(repo, 'docs/ai/specs/shared/01-spec.md');
      append(repo, 'docs/person/requirements/01-requirements.md');
      append(repo, 'docs/client/delivery/01-chapter.md');
      append(repo, 'src/index.ts');
    });
    assert.equal(result.verdict, 'human');
    assert.deepEqual(pathsOf(result.reasons), ['docs/client/delivery/01-chapter.md', 'docs/person/requirements/01-requirements.md']);
  });

  it('person/ の新規ファイルと削除も human', async () => {
    const added = await change((repo) => repo.write('docs/person/requirements/02-new.md', '# new\n'));
    assert.equal(added.verdict, 'human');
    assert.deepEqual(pathsOf(added.reasons), ['docs/person/requirements/02-new.md']);
    const removed = await change((repo) => repo.remove('docs/person/decisions/2026/0001-x.md'));
    assert.equal(removed.verdict, 'human');
    assert.deepEqual(pathsOf(removed.reasons), ['docs/person/decisions/2026/0001-x.md']);
  });

  it('person/ から ai/ への移動は human (元の削除と先の追加の 2 行に分けて見る)', async () => {
    const result = await change((repo) => repo.move('docs/person/requirements/01-requirements.md', 'docs/ai/specs/shared/01-requirements.md'));
    assert.equal(result.verdict, 'human');
    assert.deepEqual(pathsOf(result.reasons), ['docs/person/requirements/01-requirements.md']);
    assert.equal(result.changedCount, 2); // 削除 1 + 追加 1。rename として 1 行にまとまらない
  });

  it('client/ から ai/ への移動も、ai/ から person/ への移動も human', async () => {
    const out = await change((repo) => repo.move('docs/client/delivery/01-chapter.md', 'docs/ai/handbook/01-chapter.md'));
    assert.equal(out.verdict, 'human');
    assert.deepEqual(pathsOf(out.reasons), ['docs/client/delivery/01-chapter.md']);
    const into = await change((repo) => repo.move('docs/ai/specs/shared/01-spec.md', 'docs/person/design/shared/01-spec.md'));
    assert.equal(into.verdict, 'human');
    assert.deepEqual(pathsOf(into.reasons), ['docs/person/design/shared/01-spec.md']);
  });

  it('ai/ の中だけの移動は ai', async () => {
    const result = await change((repo) => repo.move('docs/ai/specs/shared/01-spec.md', 'docs/ai/specs/other/01-spec.md'));
    assert.equal(result.verdict, 'ai');
  });

  it('門を決めるファイル (CODEOWNERS・CI の設定・.igeta.json・AGENTS.md) は human', async () => {
    const result = await change((repo) => {
      append(repo, '.github/CODEOWNERS');
      append(repo, '.github/workflows/ci.yml');
      repo.write('.github/workflows/deploy.yml', 'name: deploy\n');
      repo.write('.igeta.json', `${JSON.stringify({ humanPaths: GATE_GLOBS, contextSizeLimit: 100 })}\n`);
      append(repo, 'AGENTS.md');
    });
    assert.equal(result.verdict, 'human');
    assert.deepEqual(pathsOf(result.reasons), ['.github/CODEOWNERS', '.github/workflows/ci.yml', '.github/workflows/deploy.yml', '.igeta.json', 'AGENTS.md']);
    assert.ok(result.reasons.every((r) => r.rule === '門を決めるファイル'));
  });

  it('門を決めるファイルの削除も human', async () => {
    for (const path of ['.github/CODEOWNERS', '.igeta.json', 'AGENTS.md', '.github/workflows/ci.yml']) {
      const result = await change((repo) => repo.remove(path));
      assert.equal(result.verdict, 'human', path);
      assert.deepEqual(pathsOf(result.reasons), [path]);
    }
  });

  it('名前が似ているだけのパス (入れ子の AGENTS.md・.igeta.json・workflows 以外の .github) は門ではない', async () => {
    const result = await change((repo) => {
      append(repo, 'docs/ai/handbook/AGENTS.md');
      append(repo, 'sub/AGENTS.md');
      append(repo, 'sub/.igeta.json');
      append(repo, '.github/ISSUE_TEMPLATE/bug.md');
      append(repo, '.github/dependabot.yml');
    });
    assert.equal(result.verdict, 'ai');
    assert.deepEqual(result.reasons, []);
  });

  it('humanPaths (Igeta 自身の 7 つ) に当たるパスは human、外れるパスは ai', async () => {
    const humanFiles = [
      'templates/docs/a.md',
      'src/checks/Check.ts',
      'src/gate/Gate.ts',
      'src/core/Role.ts',
      'src/core/IgetaConfig.ts',
      'src/core/LineClassifier.ts',
      'docs/explanation/03-c.md',
      'docs/explanation/09-d.md',
    ];
    const aiFiles = ['src/index.ts', 'src/cli/Command.ts', 'src/core/Other.ts', 'docs/explanation/01-a.md', 'docs/explanation/02-b.md', 'docs/explanation/10-e.md', 'docs/explanation/README.md'];
    const result = await change((repo) => {
      for (const path of [...humanFiles, ...aiFiles]) append(repo, path);
    });
    assert.equal(result.verdict, 'human');
    assert.deepEqual(pathsOf(result.reasons), [...humanFiles].sort());
    for (const path of aiFiles) assert.ok(!pathsOf(result.reasons).includes(path), `${path} は人の承認を要しない`);
    assert.equal(result.reasons.find((r) => r.path === 'src/checks/Check.ts')?.rule, 'humanPaths: src/checks/**');
  });

  it('humanPaths を設定していない repo では src/checks/ の変更も ai', async () => {
    const result = await change((repo) => append(repo, 'src/checks/Check.ts'), without('.igeta.json'));
    assert.equal(result.verdict, 'ai');
  });

  it('humanPaths に当たるファイルの移動は、元と先のどちらが当たっても human', async () => {
    const out = await change((repo) => repo.move('src/checks/Check.ts', 'src/cli/Check.ts'));
    assert.equal(out.verdict, 'human');
    assert.deepEqual(pathsOf(out.reasons), ['src/checks/Check.ts']);
    const into = await change((repo) => repo.move('src/cli/Command.ts', 'src/gate/Command.ts'));
    assert.equal(into.verdict, 'human');
    assert.deepEqual(pathsOf(into.reasons), ['src/gate/Command.ts']);
  });

  it('日本語・空白を含むパスも判定できる', async () => {
    const result = await change((repo) => repo.write('docs/person/requirements/要件 定義 (案).md', '# x\n'));
    assert.equal(result.verdict, 'human');
    assert.deepEqual(pathsOf(result.reasons), ['docs/person/requirements/要件 定義 (案).md']);
  });

  it('変更が無い (差分が空) なら ai。0 件を人の承認にもしない', async () => {
    const repo = TestRepo.create(BASE);
    repo.branch();
    const result = await judged(repo);
    assert.equal(result.verdict, 'ai');
    assert.equal(result.changedCount, 0);
  });
});

describe('差分の取り方: 作業ツリーまで見る', () => {
  it('commit していない変更 (tracked の編集・git add 済みの新規・まだ add していない新規) も見る', async () => {
    const repo = TestRepo.create(BASE);
    repo.branch();
    append(repo, 'docs/person/requirements/01-requirements.md'); // 編集 (未 commit)
    assert.deepEqual(pathsOf((await judged(repo)).reasons), ['docs/person/requirements/01-requirements.md']);
    repo.write('docs/client/delivery/02-staged.md', '# staged\n');
    repo.git('add', 'docs/client/delivery/02-staged.md'); // add 済みの新規
    repo.write('docs/person/requirements/03-untracked.md', '# untracked\n'); // add していない新規
    const result = await judged(repo);
    assert.deepEqual(pathsOf(result.reasons), [
      'docs/client/delivery/02-staged.md',
      'docs/person/requirements/01-requirements.md',
      'docs/person/requirements/03-untracked.md',
    ]);
  });

  it('.gitignore された生成物 (node_modules など) は差分に入れない', async () => {
    const repo = TestRepo.create({ ...BASE, '.gitignore': 'node_modules/\n' });
    repo.branch();
    repo.write('node_modules/x/docs/person/y.md', '# y\n');
    const result = await judged(repo);
    assert.equal(result.verdict, 'ai');
    assert.equal(result.changedCount, 0);
  });

  it('起点は merge-base: main が先へ進んで main 側に person/ の変更があっても、feature の差分だけで判定する', async () => {
    const repo = TestRepo.create(BASE);
    repo.branch();
    append(repo, 'docs/ai/specs/shared/01-spec.md');
    repo.commit('feature');
    repo.git('checkout', '-q', 'main');
    append(repo, 'docs/person/requirements/01-requirements.md'); // main だけが進んだ
    repo.commit('main advances');
    repo.git('checkout', '-q', 'feature');
    const result = await judged(repo); // main の先端との直接の差分なら person/ が出てしまう
    assert.equal(result.verdict, 'ai');
    assert.equal(result.changedCount, 1);
    assert.equal(result.base.commit, repo.git('merge-base', 'main', 'HEAD'));
  });

  it('--base には branch 名のほか commit の ID・HEAD~1 のような式も使える', async () => {
    const repo = TestRepo.create(BASE);
    const first = repo.git('rev-parse', 'HEAD');
    repo.branch();
    append(repo, 'docs/ai/specs/shared/01-spec.md');
    repo.commit('one');
    append(repo, 'docs/person/requirements/01-requirements.md');
    repo.commit('two');
    assert.equal((await judged(repo, local('main'))).verdict, 'human');
    assert.equal((await judged(repo, local(first))).verdict, 'human');
    assert.equal((await judged(repo, local('HEAD~1'))).verdict, 'human'); // 最後の commit だけを見る
    assert.equal((await judged(repo, local('HEAD'))).verdict, 'ai'); // 変更なし
  });

  it('作業ツリーと index の内容を書き換えない (未 commit の変更も、判定の前後で git status が同じ)', async () => {
    const repo = TestRepo.create(BASE);
    repo.branch();
    append(repo, 'docs/ai/specs/shared/01-spec.md');
    repo.commit();
    append(repo, 'docs/person/requirements/01-requirements.md'); // 未 commit の編集
    repo.write('docs/client/delivery/02-untracked.md', '# untracked\n'); // 未追跡
    repo.git('add', 'docs/person/requirements/01-requirements.md'); // add 済み
    const status = repo.git('status', '--porcelain');
    assert.notEqual(status, '');
    assert.equal((await judged(repo)).verdict, 'human');
    assert.equal(repo.git('status', '--porcelain'), status);
    assert.equal(readFileSync(join(repo.root, 'docs/client/delivery/02-untracked.md'), 'utf8'), '# untracked\n');
  });
});

describe('検査不能: ai を返さない場合', () => {
  it('旧い構成の repo (docs/person・ai・client のどれも無い) は検査不能。差分が ai に見えるものだけでも ai にしない', async () => {
    const repo = TestRepo.create({
      'docs/design/basic/01-basic.md': '# 基本設計\n',
      'docs/product/01-requirements.md': '# 要件\n',
      'src/index.ts': 'export {};\n',
    });
    repo.branch();
    append(repo, 'docs/design/basic/01-basic.md'); // 人の決定が入る基本設計。person/ が無いので ai に見える
    repo.commit();
    const message = cannotCheckMessage(await judge(repo));
    assert.match(message, /旧い構成の repo/);
    assert.match(message, /docs\/person・docs\/ai・docs\/client のどれも無い/);
  });

  it('3 フォルダのどれか 1 つでもあれば新しい構成として判定する', async () => {
    for (const folder of ['docs/person', 'docs/ai', 'docs/client']) {
      const repo = TestRepo.create({ [`${folder}/x.md`]: '# x\n', 'src/index.ts': 'export {};\n' });
      repo.branch();
      append(repo, 'src/index.ts');
      repo.commit();
      assert.equal((await judged(repo)).verdict, 'ai', folder);
    }
  });

  it('旧い構成から新しい構成へ移す PR (person/ を作る) は human', async () => {
    const repo = TestRepo.create({ 'docs/design/basic/01-basic.md': '# 基本設計\n' });
    repo.branch();
    repo.move('docs/design/basic/01-basic.md', 'docs/person/design/shared/01-basic.md');
    repo.write('docs/ai/specs/shared/02-detail.md', '# 詳細\n');
    repo.commit();
    const result = await judged(repo);
    assert.equal(result.verdict, 'human');
    assert.deepEqual(pathsOf(result.reasons), ['docs/person/design/shared/01-basic.md']);
  });

  it('.igeta.json が読めない (JSON が壊れている・humanPaths の glob が使えない・nonDocPaths が 3 フォルダに当たる) と検査不能', async () => {
    const broken: Record<string, string> = {
      'JSON が壊れている': '{ not json',
      'humanPaths の glob が使えない': JSON.stringify({ humanPaths: ['!src/**'] }),
      'humanPaths が配列でない': JSON.stringify({ humanPaths: 'src/**' }),
      'nonDocPaths が 3 フォルダに当たる': JSON.stringify({ nonDocPaths: ['docs/person/**'] }),
    };
    for (const [name, content] of Object.entries(broken)) {
      const repo = TestRepo.create({ ...BASE, '.igeta.json': content });
      repo.branch();
      append(repo, 'src/index.ts');
      repo.commit();
      assert.match(cannotCheckMessage(await judge(repo)), /\.igeta\.json を使えないので判定できない/, name);
    }
  });

  it('git の repo でないディレクトリは検査不能', async () => {
    const root = tempDir('igeta-approval-scope-nogit-');
    mkdirSync(join(root, 'docs', 'person'), { recursive: true });
    const message = cannotCheckMessage(await judgeApprovalScope({ root, igetaRoot: IGETA_ROOT, base: local() }));
    assert.match(message, /git rev-parse --show-toplevel が失敗した/);
  });

  it('git の作業ツリーの最上位でない --root (部分木) は、repo 直下のパスで判定できないので検査不能', async () => {
    const repo = TestRepo.create({ 'sub/docs/person/x.md': '# x\n', 'sub/src/a.ts': 'export {};\n', '.github/workflows/ci.yml': 'name: ci\n' });
    repo.branch();
    append(repo, '.github/workflows/ci.yml'); // 部分木の外にある門のファイル
    repo.commit();
    const result = await judgeApprovalScope({ root: join(repo.root, 'sub'), igetaRoot: IGETA_ROOT, base: local() });
    assert.match(cannotCheckMessage(result), /最上位ではない/);
  });
});
