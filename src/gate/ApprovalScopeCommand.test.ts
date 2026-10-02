// node --test dist/gate/ApprovalScopeCommand.test.js
// igeta approval-scope コマンド: 起点 (--ci / --base)・出力・終了コードを、本物の git repo と別プロセスで確かめる。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Cli } from '../cli/Cli.js';
import { ExitCode } from '../core/ExitCode.js';
import { IGETA_ROOT } from '../core/Paths.js';
import { judgeApprovalScope } from './ApprovalScope.js';
import { ApprovalScopeCommand } from './ApprovalScopeCommand.js';
import type { BaseSpec } from './ApprovalScope.js';
import { BASE, TestRepo, append, cannotCheckMessage, doc, generate, gitIn, judge, judged, local, packageJsonWith, pathsOf, tempDir, withOrigin } from './ApprovalScopeFixture.js';

describe('起点: --ci は CI の保護ブランチとの merge-base、得られなければ検査不能', () => {
  const ci = (branch = 'main'): BaseSpec => ({ mode: 'ci', branch });

  it('origin/<保護ブランチ> との merge-base から判定する', async () => {
    const { repo } = withOrigin();
    repo.branch();
    append(repo, 'docs/ai/specs/shared/01-spec.md');
    repo.commit();
    const ai = await judged(repo, ci());
    assert.equal(ai.verdict, 'ai');
    assert.equal(ai.base.mode, 'ci');
    assert.equal(ai.base.ref, 'origin/main');
    append(repo, 'docs/person/requirements/01-requirements.md');
    repo.commit();
    assert.equal((await judged(repo, ci())).verdict, 'human');
  });

  it('GitHub Actions の pull_request の checkout と同じ形 (HEAD が「保護ブランチの先端 + PR の head」の merge commit) でも、PR の差分だけで判定する', async () => {
    const { repo } = withOrigin();
    repo.branch(); // PR の head
    append(repo, 'docs/ai/specs/shared/01-spec.md');
    repo.commit('PR');
    repo.git('checkout', '-q', 'main');
    append(repo, 'docs/person/requirements/01-requirements.md'); // 保護ブランチが先へ進んだ (別の人の変更)
    repo.commit('保護ブランチの変更');
    repo.git('push', '-q', 'origin', 'main');
    repo.git('checkout', '-q', '--detach', 'origin/main');
    repo.git('merge', '-q', '--no-ff', '-m', 'Merge pull request #1 from feature', 'feature'); // refs/pull/1/merge と同じ形
    const ai = await judged(repo, ci());
    assert.equal(ai.verdict, 'ai'); // 保護ブランチ側の person/ の変更は PR の差分ではない
    assert.equal(ai.changedCount, 1);

    // PR が person/ に触れていれば human (merge commit の上でも見落とさない)
    repo.git('checkout', '-q', 'feature');
    append(repo, 'docs/client/delivery/01-chapter.md');
    repo.commit('PR: client');
    repo.git('checkout', '-q', '--detach', 'origin/main');
    repo.git('merge', '-q', '--no-ff', '-m', 'Merge pull request #1 from feature', 'feature');
    const human = await judged(repo, ci());
    assert.equal(human.verdict, 'human');
    assert.deepEqual(pathsOf(human.reasons), ['docs/client/delivery/01-chapter.md']);
  });

  it('origin/main が手元の main より先へ進んでいても、merge-base で判定する', async () => {
    const { repo } = withOrigin();
    repo.branch();
    append(repo, 'docs/ai/specs/shared/01-spec.md');
    repo.commit();
    // 別の作業者が main の person/ を変えて push した (手元の main は古いまま)
    repo.git('checkout', '-q', 'main');
    append(repo, 'docs/person/requirements/01-requirements.md');
    repo.commit('他の人の変更');
    repo.git('push', '-q', 'origin', 'main');
    repo.git('reset', '-q', '--hard', 'HEAD~1'); // 手元の main は古い
    repo.git('checkout', '-q', 'feature');
    const result = await judged(repo, ci());
    assert.equal(result.verdict, 'ai');
  });

  it('origin/<名前> が無い (浅い checkout で保護ブランチの履歴が無い) と検査不能。fetch-depth: 0 を案内する', async () => {
    const { repo } = withOrigin();
    repo.branch();
    append(repo, 'docs/ai/specs/shared/01-spec.md');
    repo.commit();
    const message = cannotCheckMessage(await judge(repo, ci('release')));
    assert.match(message, /refs\/remotes\/origin\/release が無い/);
    assert.match(message, /fetch-depth: 0/);
  });

  it('履歴が浅く merge-base を決められないときも検査不能 (ai を返さない)', async () => {
    const { repo, origin } = withOrigin();
    repo.branch();
    append(repo, 'docs/ai/specs/shared/01-spec.md');
    repo.commit();
    repo.git('push', '-q', 'origin', 'feature');
    const shallow = tempDir('igeta-approval-scope-shallow-');
    gitIn(shallow, 'clone', '-q', '--depth', '1', '--branch', 'feature', `file://${origin}`, '.');
    gitIn(shallow, 'fetch', '-q', '--depth', '1', 'origin', 'main:refs/remotes/origin/main');
    const message = cannotCheckMessage(await judgeApprovalScope({ root: shallow, igetaRoot: IGETA_ROOT, base: ci() }));
    assert.match(message, /共通の祖先が無く merge-base を決められない/);
    assert.match(message, /fetch-depth: 0/);
  });

  it('環境変数から来た保護ブランチ名を git の式として解釈しない (main~1・オプション注入)', async () => {
    const { repo } = withOrigin();
    repo.branch();
    append(repo, 'docs/ai/specs/shared/01-spec.md');
    repo.commit();
    assert.match(cannotCheckMessage(await judge(repo, ci('main~1'))), /ref として正しくない/);
    assert.match(cannotCheckMessage(await judge(repo, ci('main^'))), /ref として正しくない/);
    const pwned = join(tempDir('igeta-approval-scope-pwn-'), 'pwned');
    cannotCheckMessage(await judge(repo, ci(`--output=${pwned}`)));
    assert.equal(existsSync(pwned), false);
  });

  it('--base が存在しない ref だと検査不能', async () => {
    const repo = TestRepo.create(BASE);
    repo.branch();
    assert.match(cannotCheckMessage(await judge(repo, local('no-such-branch'))), /commit として解決できない/);
  });

  it('履歴の無い repo (commit が 0 件) は検査不能', async () => {
    const root = tempDir('igeta-approval-scope-empty-');
    gitIn(root, 'init', '-q', '-b', 'main');
    mkdirSync(join(root, 'docs', 'person'), { recursive: true });
    assert.match(cannotCheckMessage(await judgeApprovalScope({ root, igetaRoot: IGETA_ROOT, base: local() })), /解決できない/);
  });
});

describe('igeta approval-scope コマンド: 出力と終了コード', () => {
  interface Run {
    readonly code: number;
    readonly stdout: readonly string[];
    readonly stderr: readonly string[];
  }

  async function run(argv: readonly string[], cwd: string, env: Record<string, string | undefined> = {}): Promise<Run> {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const cli = new Cli().register(new ApprovalScopeCommand({ env }));
    const code = await cli.run(['approval-scope', ...argv], {
      cwd,
      igetaRoot: IGETA_ROOT,
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });
    return { code, stdout, stderr };
  }

  async function featureRepo(mutate: (repo: TestRepo) => void): Promise<TestRepo> {
    const repo = TestRepo.create(BASE);
    repo.branch();
    mutate(repo);
    repo.commit();
    return repo;
  }

  it('ai: 1 行目は ai・終了コード 0 (Ok)・理由のパスは出さない', async () => {
    const repo = await featureRepo((r) => append(r, 'src/index.ts'));
    const result = await run(['--base', 'main'], repo.root);
    assert.equal(result.code, ExitCode.Ok);
    assert.equal(result.stdout[0], 'ai');
    assert.equal(result.stdout[1], '');
    assert.ok(!result.stdout.some((line) => line.startsWith('- ')));
    assert.deepEqual(result.stderr, []);
  });

  it('human: 1 行目は human・続けて理由のパス・終了コード 1 (Violation)', async () => {
    const repo = await featureRepo((r) => {
      append(r, 'docs/person/requirements/01-requirements.md');
      r.write('package.json', packageJsonWith({ scripts: { build: 'x' } }));
      append(r, 'src/index.ts');
    });
    const result = await run(['--base', 'main'], repo.root);
    assert.equal(result.code, ExitCode.Violation);
    assert.equal(result.stdout[0], 'human');
    assert.equal(result.stdout[1], '- docs/person/requirements/01-requirements.md (docs/person/ の文書)');
    assert.equal(result.stdout[2], '- package.json (package.json の scripts が変わった)');
    assert.equal(result.stdout[3], '');
    assert.match(result.stdout[5] ?? '', /^変更 3 件のうち、人の承認が要るもの 2 件$/);
    assert.deepEqual(result.stderr, []);
  });

  it('--base の出力には「手元の確認用」と書く。--ci の出力には書かない', async () => {
    const { repo } = withOrigin();
    repo.branch();
    append(repo, 'src/index.ts');
    repo.commit();
    const manual = await run(['--base', 'main'], repo.root);
    assert.ok(manual.stdout.some((line) => line.includes('手元の確認用')), manual.stdout.join('\n'));
    assert.match(manual.stdout.join('\n'), /起点: main との merge-base [0-9a-f]{12}\n/);
    const inCi = await run(['--ci'], repo.root, { GITHUB_BASE_REF: 'main' });
    assert.equal(inCi.code, ExitCode.Ok);
    assert.equal(inCi.stdout[0], 'ai');
    assert.ok(!inCi.stdout.some((line) => line.includes('手元の確認用')));
    assert.match(inCi.stdout.join('\n'), /起点: origin\/main との merge-base [0-9a-f]{12} \(--ci\)\n/);
  });

  it('除いた README は「判定から除いた README」として出す', async () => {
    const repo = TestRepo.create({ 'docs/person/requirements/01-requirements.md': doc('requirements', '要件') });
    await generate(repo);
    repo.commit('生成');
    repo.write('docs/person/requirements/02-second.md', doc('second', '2 本目'));
    repo.commit('古い索引');
    repo.branch();
    await generate(repo);
    repo.commit('再生成');
    const result = await run(['--base', 'main'], repo.root);
    assert.equal(result.code, ExitCode.Ok);
    assert.equal(result.stdout[0], 'ai');
    assert.match(result.stdout.join('\n'), /判定から除いた README \(生成索引の区間だけの変更で、再生成と一致した\):\n- docs\/person\/requirements\/README\.md/);
  });

  it('検査不能: 標準出力は空・標準エラーに CANNOT-CHECK・終了コード 2', async () => {
    const repo = TestRepo.create({ 'docs/design/basic/01-basic.md': '# 基本設計\n' });
    repo.branch();
    const result = await run(['--base', 'main'], repo.root);
    assert.equal(result.code, ExitCode.CannotCheck);
    assert.deepEqual(result.stdout, []);
    assert.equal(result.stderr.length, 1);
    assert.match(result.stderr[0] ?? '', /^CANNOT-CHECK 旧い構成の repo/);
  });

  it('--ci で環境変数 GITHUB_BASE_REF が無い・空だと検査不能 (ai にしない)', async () => {
    const repo = await featureRepo((r) => append(r, 'src/index.ts'));
    for (const env of [{}, { GITHUB_BASE_REF: '' }, { GITHUB_BASE_REF: undefined }]) {
      const result = await run(['--ci'], repo.root, env);
      assert.equal(result.code, ExitCode.CannotCheck);
      assert.deepEqual(result.stdout, []);
      assert.match(result.stderr[0] ?? '', /^CANNOT-CHECK --ci: CI の環境変数 GITHUB_BASE_REF から保護ブランチを得られない/);
    }
  });

  it('--ci で origin/<保護ブランチ> が無いと検査不能。--ci は手元の main を黙って使わない', async () => {
    const repo = await featureRepo((r) => append(r, 'src/index.ts')); // 手元に main はあるが origin は無い
    const result = await run(['--ci'], repo.root, { GITHUB_BASE_REF: 'main' });
    assert.equal(result.code, ExitCode.CannotCheck);
    assert.match(result.stderr[0] ?? '', /refs\/remotes\/origin\/main が無い/);
  });

  it('引数の誤りは検査不能 (2): --ci と --base の同時指定・どちらも無い・値が無い・余分な引数・未知の引数', async () => {
    const repo = await featureRepo((r) => append(r, 'src/index.ts'));
    const cases: ReadonlyArray<readonly [argv: string[], message: RegExp]> = [
      [['--ci', '--base', 'main'], /--ci と --base は同時に指定できない/],
      [[], /--ci か --base <ref> のどちらかが要る/],
      [['--base'], /--base に値がありません/],
      [['--base', '-x'], /- で始まっている/],
      [['--base', 'main', 'extra'], /余分な引数: extra/],
      [['--base', 'main', '--config', 'x.json'], /不明な引数: --config/],
    ];
    for (const [argv, message] of cases) {
      const result = await run(argv, repo.root, { GITHUB_BASE_REF: 'main' });
      assert.equal(result.code, ExitCode.CannotCheck, argv.join(' '));
      assert.deepEqual(result.stdout, [], argv.join(' '));
      assert.match(result.stderr.join('\n'), message, argv.join(' '));
    }
  });

  it('--root で別のディレクトリの repo を判定できる', async () => {
    const repo = await featureRepo((r) => append(r, 'docs/person/requirements/01-requirements.md'));
    const elsewhere = tempDir('igeta-approval-scope-cwd-');
    const result = await run(['--base', 'main', '--root', repo.root], elsewhere);
    assert.equal(result.code, ExitCode.Violation);
    assert.equal(result.stdout[0], 'human');
  });

  it('改行などを含むパスは JSON で引用符付きに出し、出力の行を偽造できない', async () => {
    const repo = await featureRepo((r) => r.write('docs/person/requirements/x\nai', '# x\n'));
    const result = await run(['--base', 'main'], repo.root);
    assert.equal(result.stdout[0], 'human');
    assert.equal(result.stdout[1], '- "docs/person/requirements/x\\nai" (docs/person/ の文書)');
    assert.ok(!result.stdout.includes('ai'));
  });

  it('usage に終了コードの割り当てと、--base は手元の確認用で CI では使わない旨を書く', async () => {
    const stdout: string[] = [];
    const cli = new Cli().register(new ApprovalScopeCommand({ env: {} }));
    const code = await cli.run(['approval-scope', '--help'], { cwd: tmpdir(), igetaRoot: IGETA_ROOT, stdout: (l) => stdout.push(l), stderr: () => undefined });
    assert.equal(code, ExitCode.Ok);
    const text = stdout.join('\n');
    assert.match(text, /0 = ai \/ 1 = human \/ 2 = 検査不能/);
    assert.match(text, /手元の確認用/);
    assert.match(text, /fetch-depth: 0/);
    assert.match(text, /pull_request_target は既定で保護ブランチ側を checkout するので差分が空/);
  });
});

describe('実際の igeta コマンド (dist/cli.js) を別プロセスで動かす', () => {
  const cli = join(IGETA_ROOT, 'dist', 'cli.js');

  function igeta(cwd: string, args: readonly string[], env: Record<string, string> = {}): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', env: { ...process.env, GITHUB_BASE_REF: '', ...env } });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  it('ai は終了コード 0、human は 1、検査不能は 2。1 行目で human / ai を読める', () => {
    const repo = TestRepo.create(BASE);
    repo.branch();
    append(repo, 'src/index.ts');
    repo.commit('ai');
    const ai = igeta(repo.root, ['approval-scope', '--base', 'main']);
    assert.equal(ai.status, 0);
    assert.equal(ai.stdout.split('\n')[0], 'ai');

    append(repo, 'docs/client/delivery/01-chapter.md');
    repo.commit('client');
    const human = igeta(repo.root, ['approval-scope', '--base', 'main']);
    assert.equal(human.status, 1);
    assert.equal(human.stdout.split('\n')[0], 'human');
    assert.equal(human.stdout.split('\n')[1], '- docs/client/delivery/01-chapter.md (docs/client/ の文書)');

    const unknown = igeta(repo.root, ['approval-scope', '--ci']);
    assert.equal(unknown.status, 2);
    assert.equal(unknown.stdout, '');
    assert.match(unknown.stderr, /CANNOT-CHECK/);
  });

  it('GITHUB_BASE_REF を使う --ci も別プロセスで動く', () => {
    const origin = tempDir('igeta-approval-scope-origin-');
    gitIn(origin, 'init', '-q', '--bare', '-b', 'main');
    const repo = TestRepo.create(BASE);
    repo.git('remote', 'add', 'origin', origin);
    repo.git('push', '-q', 'origin', 'main');
    repo.branch();
    append(repo, '.github/workflows/ci.yml');
    repo.commit();
    const result = igeta(repo.root, ['approval-scope', '--ci'], { GITHUB_BASE_REF: 'main' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout.split('\n')[0], 'human');
    assert.equal(result.stdout.split('\n')[1], '- .github/workflows/ci.yml (門を決めるファイル)');
  });

  it('igeta --help の一覧に approval-scope がある', () => {
    const result = igeta(tmpdir(), ['--help']);
    assert.match(result.stdout, /approval-scope +人の承認が要る変更かを差分のパスだけで判定する/);
  });
});
