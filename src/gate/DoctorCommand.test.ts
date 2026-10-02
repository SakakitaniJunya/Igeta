// node --test dist/gate/DoctorCommand.test.js
// igeta doctor: 保護ブランチの設定の表示・警告・検査不能 (ADR-0008「限界」(2))。
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Cli } from '../cli/Cli.js';
import { DoctorCommand } from '../cli/commands/DoctorCommand.js';
import { ExitCode } from '../core/ExitCode.js';
import { IGETA_ROOT } from '../core/Paths.js';
import type { GhResult, GhRunner } from './BranchProtection.js';

const workspaces: string[] = [];

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

const ok = (body: unknown): GhResult => ({ kind: 'exited', status: 0, stdout: JSON.stringify(body), stderr: '' });
const notProtected: GhResult = {
  kind: 'exited',
  status: 1,
  stdout: JSON.stringify({ message: 'Branch not protected', documentation_url: 'https://docs.github.com/rest', status: '404' }),
  stderr: 'gh: Branch not protected (HTTP 404)\n',
};
const forbidden: GhResult = {
  kind: 'exited',
  status: 1,
  stdout: JSON.stringify({ message: 'Resource not accessible by personal access token', status: '403' }),
  stderr: 'gh: Resource not accessible by personal access token (HTTP 403)\n',
};

const REPO = ok({ full_name: 'SakakitaniJunya/Igeta', default_branch: 'main' });

interface Routes {
  readonly repo?: GhResult;
  readonly protection?: GhResult;
  readonly rules?: GhResult;
}

function runnerOf(routes: Routes, seen: { paths: string[]; cwds: string[] } = { paths: [], cwds: [] }): GhRunner {
  return (args, cwd) => {
    const path = args[1] ?? '';
    seen.paths.push(path);
    seen.cwds.push(cwd);
    if (path === 'repos/{owner}/{repo}') return routes.repo ?? REPO;
    if (/\/protection$/.test(path)) return routes.protection ?? notProtected;
    return routes.rules ?? ok([]);
  };
}

interface Run {
  readonly code: number;
  readonly stdout: readonly string[];
  readonly stderr: readonly string[];
}

async function run(argv: readonly string[], runGh: GhRunner, cwd = tmpdir()): Promise<Run> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await new Cli().register(new DoctorCommand({ runGh })).run(['doctor', ...argv], {
    cwd,
    igetaRoot: IGETA_ROOT,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  return { code, stdout, stderr };
}

const reviews = (approvals: number, codeOwners: boolean): GhResult =>
  ok({ required_pull_request_reviews: { required_approving_review_count: approvals, require_code_owner_reviews: codeOwners } });

describe('igeta doctor', () => {
  it('承認 1 件以上・CODEOWNERS のレビュー必須なら、設定を表示して OK (終了コード 0)', async () => {
    const result = await run([], runnerOf({ protection: reviews(1, true) }));
    assert.equal(result.code, ExitCode.Ok);
    assert.deepEqual(result.stdout, [
      '保護ブランチ: main (SakakitaniJunya/Igeta)',
      '  ブランチ保護: 必須の承認 1 件・CODEOWNERS のレビュー 必須',
      '  ruleset: PR のレビューを要求する ruleset が無い',
      'OK docs/person/ の変更に人のレビューが必須になっている',
    ]);
    assert.deepEqual(result.stderr, []);
  });

  it('保護が無い (実際の Igeta の main と同じ状態) と、設定を表示したうえで WARN。終了コードは変えない', async () => {
    const result = await run([], runnerOf({}));
    assert.equal(result.code, ExitCode.Ok);
    assert.deepEqual(result.stdout, [
      '保護ブランチ: main (SakakitaniJunya/Igeta)',
      '  ブランチ保護: ブランチ保護が設定されていない',
      '  ruleset: PR のレビューを要求する ruleset が無い',
    ]);
    assert.equal(result.stderr.length, 1);
    assert.equal(
      result.stderr[0],
      'WARN 保護ブランチ main は docs/person/ の変更に人のレビューを必須にしていない (必須の承認 0 件・CODEOWNERS のレビュー 不要)。' +
        '承認が 1 件以上かつ CODEOWNERS のレビューが必須でないと、人の承認なしに merge できる (ADR-0008)',
    );
  });

  it('CODEOWNERS のレビューが不要・承認が 0 件のどちらでも WARN (承認数と要否を警告に出す)', async () => {
    const noCodeOwner = await run([], runnerOf({ protection: reviews(2, false) }));
    assert.match(noCodeOwner.stderr[0] ?? '', /^WARN .*\(必須の承認 2 件・CODEOWNERS のレビュー 不要\)/);
    const noApprovals = await run([], runnerOf({ protection: reviews(0, true) }));
    assert.match(noApprovals.stderr[0] ?? '', /^WARN .*\(必須の承認 0 件・CODEOWNERS のレビュー 必須\)/);
    assert.equal(noApprovals.code, ExitCode.Ok);
  });

  it('ruleset だけで人のレビューを必須にしている repo は OK', async () => {
    const rules = ok([{ type: 'pull_request', parameters: { required_approving_review_count: 1, require_code_owner_review: true } }]);
    const result = await run([], runnerOf({ rules }));
    assert.equal(result.code, ExitCode.Ok);
    assert.deepEqual(result.stderr, []);
    assert.ok(result.stdout.includes('  ruleset: 必須の承認 1 件・CODEOWNERS のレビュー 必須'));
    assert.equal(result.stdout.at(-1), 'OK docs/person/ の変更に人のレビューが必須になっている');
  });

  it('設定の一部が読めず必須と言えないときは検査不能 (終了コード 2)。読めた設定は表示する', async () => {
    const result = await run([], runnerOf({ protection: forbidden }));
    assert.equal(result.code, ExitCode.CannotCheck);
    assert.deepEqual(result.stdout.slice(0, 2), ['保護ブランチ: main (SakakitaniJunya/Igeta)', '  ブランチ保護: 読めない (gh api の branches/<branch>/protection が失敗した (終了コード 1): gh: Resource not accessible by personal access token (HTTP 403))']);
    assert.equal(result.stderr.length, 1);
    assert.match(result.stderr[0] ?? '', /^CANNOT-CHECK 保護ブランチ main の設定を全部は読めず、docs\/person\/ の変更に人のレビューが必須か確かめられない: ブランチ保護: /);
  });

  it('gh が無い・認証できないと検査不能。標準出力に OK も WARN も出さない (黙って成功にしない)', async () => {
    const missing = await run([], () => ({ kind: 'not-run', reason: 'gh が見つからない (PATH に無い)' }));
    assert.equal(missing.code, ExitCode.CannotCheck);
    assert.deepEqual(missing.stdout, []);
    assert.deepEqual(missing.stderr, ['CANNOT-CHECK 保護ブランチの設定を確かめられない: repo の情報を gh で読めない: gh が見つからない (PATH に無い)']);

    const unauthenticated = await run([], runnerOf({ repo: { kind: 'exited', status: 4, stdout: '', stderr: 'gh: To get started with GitHub CLI, please run:  gh auth login\n' } }));
    assert.equal(unauthenticated.code, ExitCode.CannotCheck);
    assert.deepEqual(unauthenticated.stdout, []);
    assert.match(unauthenticated.stderr[0] ?? '', /^CANNOT-CHECK .*gh auth login/);
  });

  it('--branch で確かめるブランチを選ぶ。--root は gh を実行するディレクトリになる', async () => {
    const seen = { paths: [] as string[], cwds: [] as string[] };
    const result = await run(['--branch', 'release/1.0', '--root', tmpdir()], runnerOf({ protection: reviews(1, true) }, seen), '/somewhere/else');
    assert.equal(result.code, ExitCode.Ok);
    assert.equal(result.stdout[0], '保護ブランチ: release/1.0 (SakakitaniJunya/Igeta)');
    assert.deepEqual(seen.paths.slice(1), ['repos/{owner}/{repo}/branches/release/1.0/protection', 'repos/{owner}/{repo}/rules/branches/release/1.0']);
    assert.deepEqual([...new Set(seen.cwds)].map((cwd) => cwd), [tmpdir()]);
  });

  it('引数の誤りは検査不能 (2): 空の --branch・余分な引数・未知の引数。gh は呼ばない', async () => {
    const never: GhRunner = () => assert.fail('gh を呼んではいけない');
    for (const [argv, message] of [
      [['--branch', ''], /--branch が空/],
      [['extra'], /余分な引数: extra/],
      [['--no-such'], /不明な引数: --no-such/],
    ] as const) {
      const result = await run(argv, never);
      assert.equal(result.code, ExitCode.CannotCheck, argv.join(' '));
      assert.deepEqual(result.stdout, []);
      assert.match(result.stderr.join('\n'), message);
    }
  });

  it('usage に、読む設定・WARN の条件・検査不能の扱いを書く', async () => {
    const stdout: string[] = [];
    const code = await new Cli().register(new DoctorCommand({ runGh: () => assert.fail('呼ばない') })).run(['doctor', '--help'], {
      cwd: tmpdir(),
      igetaRoot: IGETA_ROOT,
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
    });
    assert.equal(code, ExitCode.Ok);
    const text = stdout.join('\n');
    assert.match(text, /CODEOWNERS のレビュー/);
    assert.match(text, /承認が 1 件以上かつ CODEOWNERS のレビューが必須でなければ WARN/);
    assert.match(text, /検査不能 \(終了コード 2\)。成功にはしない/);
  });
});

describe('実際の igeta コマンド (dist/cli.js) を、PATH 上の偽の gh で動かす', () => {
  const cli = join(IGETA_ROOT, 'dist', 'cli.js');

  /** 呼ばれた API パスごとに決まった応答を返す gh。 */
  function fakeGh(routes: ReadonlyArray<readonly [path: string, result: { status: number; stdout: string; stderr?: string }]>): string {
    const dir = mkdtempSync(join(tmpdir(), 'igeta-fake-gh-bin-'));
    workspaces.push(dir);
    const cases = routes.map(([path, result], index) => {
      writeFileSync(join(dir, `r${index}.out`), result.stdout);
      writeFileSync(join(dir, `r${index}.err`), result.stderr ?? '');
      writeFileSync(join(dir, `r${index}.code`), String(result.status));
      return `  '${path}') n=${index} ;;`;
    });
    const script = [
      '#!/bin/sh',
      'here=$(dirname "$0")',
      'case "$2" in',
      ...cases,
      '  *) echo "想定外の gh の呼び出し: $*" >&2; exit 99 ;;',
      'esac',
      'cat "$here/r$n.out"',
      'cat "$here/r$n.err" >&2',
      'exit "$(cat "$here/r$n.code")"',
      '',
    ].join('\n');
    writeFileSync(join(dir, 'gh'), script);
    chmodSync(join(dir, 'gh'), 0o755);
    return dir;
  }

  function doctor(bin: string | null, args: readonly string[] = []): { status: number | null; stdout: string; stderr: string } {
    const empty = mkdtempSync(join(tmpdir(), 'igeta-no-gh-'));
    workspaces.push(empty);
    const result = spawnSync(process.execPath, [cli, 'doctor', ...args], {
      cwd: tmpdir(),
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin ?? empty}:/usr/bin:/bin` },
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  const repoRoute = ['repos/{owner}/{repo}', { status: 0, stdout: '{"full_name":"o/r","default_branch":"main"}' }] as const;
  const rulesRoute = ['repos/{owner}/{repo}/rules/branches/main', { status: 0, stdout: '[]' }] as const;

  it('必須になっている repo は OK・終了コード 0', () => {
    const bin = fakeGh([
      repoRoute,
      ['repos/{owner}/{repo}/branches/main/protection', { status: 0, stdout: '{"required_pull_request_reviews":{"required_approving_review_count":1,"require_code_owner_reviews":true}}' }],
      rulesRoute,
    ]);
    const result = doctor(bin);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^保護ブランチ: main \(o\/r\)\n {2}ブランチ保護: 必須の承認 1 件・CODEOWNERS のレビュー 必須\n/);
    assert.match(result.stdout, /OK docs\/person\/ の変更に人のレビューが必須になっている\n$/);
    assert.equal(result.stderr, '');
  });

  it('保護が無い repo (gh api が HTTP 404 を返す) は WARN・終了コード 0。gh の失敗を検査不能と取り違えない', () => {
    const bin = fakeGh([
      repoRoute,
      ['repos/{owner}/{repo}/branches/main/protection', { status: 1, stdout: '{"message":"Branch not protected","status":"404"}', stderr: 'gh: Branch not protected (HTTP 404)\n' }],
      rulesRoute,
    ]);
    const result = doctor(bin);
    assert.equal(result.status, 0);
    assert.match(result.stderr, /^WARN 保護ブランチ main は docs\/person\/ の変更に人のレビューを必須にしていない/);
  });

  it('gh が PATH に無いと検査不能・終了コード 2・標準出力は空', () => {
    const result = doctor(null);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^CANNOT-CHECK 保護ブランチの設定を確かめられない: repo の情報を gh で読めない: gh が見つからない/);
  });

  it('gh が認証できず失敗すると検査不能・終了コード 2', () => {
    const bin = fakeGh([['repos/{owner}/{repo}', { status: 4, stdout: '', stderr: 'gh: To get started with GitHub CLI, please run:  gh auth login\n' }]]);
    const result = doctor(bin);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /gh auth login/);
  });

  it('--branch を渡すと、そのブランチの API を呼ぶ', () => {
    const bin = fakeGh([
      repoRoute,
      ['repos/{owner}/{repo}/branches/develop/protection', { status: 0, stdout: '{"required_pull_request_reviews":{"required_approving_review_count":1,"require_code_owner_reviews":true}}' }],
      ['repos/{owner}/{repo}/rules/branches/develop', { status: 0, stdout: '[]' }],
    ]);
    const result = doctor(bin, ['--branch', 'develop']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^保護ブランチ: develop \(o\/r\)\n/);
  });

  it('igeta --help の一覧に doctor がある', () => {
    const result = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
    assert.match(result.stdout, /doctor +GitHub の保護ブランチが docs\/person\/ の変更に人のレビューを必須にしているか確かめる/);
  });
});
