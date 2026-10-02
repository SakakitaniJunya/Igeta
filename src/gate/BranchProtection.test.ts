// node --test dist/gate/BranchProtection.test.js
// 保護ブランチの設定の読み取り (ADR-0008「限界」(2))。gh の応答は、実際の gh api の応答の形で与える。
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeSource, judgePersonReview, readBranchProtection, runGh } from './BranchProtection.js';
import type { GhResult, GhRunner, ProtectionReport } from './BranchProtection.js';

const workspaces: string[] = [];
const savedPath = process.env['PATH'];

after(() => {
  if (savedPath === undefined) delete process.env['PATH'];
  else process.env['PATH'] = savedPath;
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

const ok = (body: unknown): GhResult => ({ kind: 'exited', status: 0, stdout: JSON.stringify(body), stderr: '' });

/** gh api が HTTP エラーのときの応答 (終了コード 1・本文に JSON・標準エラーに `gh: <message> (HTTP <code>)`)。 */
const httpError = (code: number, message: string): GhResult => ({
  kind: 'exited',
  status: 1,
  stdout: JSON.stringify({ message, documentation_url: 'https://docs.github.com/rest', status: String(code) }),
  stderr: `gh: ${message} (HTTP ${code})\n`,
});

const REPO = { full_name: 'SakakitaniJunya/Igeta', default_branch: 'main' };

/** 実際の GET /branches/{branch}/protection の形 (必要な項目だけでなく、他の項目も付けておく)。 */
const protection = (reviews: Record<string, unknown> | null): unknown => ({
  url: 'https://api.github.com/repos/o/r/branches/main/protection',
  required_status_checks: { strict: true, contexts: [] },
  enforce_admins: { enabled: true },
  ...(reviews === null ? {} : { required_pull_request_reviews: { dismiss_stale_reviews: true, require_last_push_approval: false, ...reviews } }),
  restrictions: null,
});

/** 実際の GET /rules/branches/{branch} の形。 */
const pullRequestRule = (parameters: Record<string, unknown>): unknown => ({
  type: 'pull_request',
  parameters: { dismiss_stale_reviews_on_push: false, require_last_push_approval: false, required_review_thread_resolution: false, ...parameters },
  ruleset_source_type: 'Repository',
  ruleset_source: 'o/r',
  ruleset_id: 42,
});

interface Routes {
  readonly repo?: GhResult;
  readonly protection?: GhResult;
  readonly rules?: GhResult;
}

/** 呼ばれた API パスを記録する gh の代わり。 */
function fakeRunner(routes: Routes): { readonly run: GhRunner; readonly calls: string[] } {
  const calls: string[] = [];
  const run: GhRunner = (args) => {
    assert.equal(args[0], 'api');
    const path = args[1] ?? '';
    calls.push(path);
    if (path === 'repos/{owner}/{repo}') return routes.repo ?? ok(REPO);
    if (/\/protection$/.test(path)) return routes.protection ?? httpError(404, 'Branch not protected');
    if (/\/rules\/branches\//.test(path)) return routes.rules ?? ok([]);
    throw new Error(`想定外の gh api: ${path}`);
  };
  return { run, calls };
}

function reportOf(routes: Routes, branch?: string): ProtectionReport {
  const result = readBranchProtection(fakeRunner(routes).run, '/repo', branch);
  assert.ok('report' in result, JSON.stringify(result));
  return result.report;
}

describe('readBranchProtection と judgePersonReview', () => {
  it('ブランチ保護が承認 1 件以上・CODEOWNERS のレビュー必須なら、docs/person/ の変更に人のレビューが必須', () => {
    const report = reportOf({ protection: ok(protection({ required_approving_review_count: 1, require_code_owner_reviews: true })) });
    assert.equal(report.repo, 'SakakitaniJunya/Igeta');
    assert.equal(report.branch, 'main');
    assert.deepEqual(report.sources.map(describeSource), [
      'ブランチ保護: 必須の承認 1 件・CODEOWNERS のレビュー 必須',
      'ruleset: PR のレビューを要求する ruleset が無い',
    ]);
    assert.deepEqual(judgePersonReview(report), { kind: 'required', approvals: 1 });
  });

  it('CODEOWNERS のレビューが必須でなければ、承認が何件でも必須ではない', () => {
    const report = reportOf({ protection: ok(protection({ required_approving_review_count: 2, require_code_owner_reviews: false })) });
    assert.equal(describeSource(report.sources[0] ?? assert.fail()), 'ブランチ保護: 必須の承認 2 件・CODEOWNERS のレビュー 不要');
    assert.deepEqual(judgePersonReview(report), { kind: 'not-required', approvals: 2, codeOwnerReview: false });
  });

  it('承認が 0 件なら、CODEOWNERS のレビューを必須にしていても必須ではない', () => {
    const report = reportOf({ protection: ok(protection({ required_approving_review_count: 0, require_code_owner_reviews: true })) });
    assert.deepEqual(judgePersonReview(report), { kind: 'not-required', approvals: 0, codeOwnerReview: true });
  });

  it('保護ブランチだが PR のレビューの項目が無い (status check だけ) は必須ではない', () => {
    const report = reportOf({ protection: ok(protection(null)) });
    assert.equal(describeSource(report.sources[0] ?? assert.fail()), 'ブランチ保護: PR のレビューを要求していない');
    assert.equal(judgePersonReview(report).kind, 'not-required');
  });

  it('保護が無い (HTTP 404 Branch not protected) は読めなかったのではなく「無い」と読む。ruleset も無ければ必須ではない', () => {
    // 2026-10-02 に実際の Igeta リポジトリの main を gh api で読んだ応答と同じ形 (保護なし・ruleset なし)
    const report = reportOf({});
    assert.deepEqual(report.sources.map((s) => s.reading.kind), ['none', 'none']);
    assert.equal(describeSource(report.sources[0] ?? assert.fail()), 'ブランチ保護: ブランチ保護が設定されていない');
    assert.deepEqual(judgePersonReview(report), { kind: 'not-required', approvals: 0, codeOwnerReview: false });
  });

  it('ruleset の pull_request ルールで承認 1 件以上・CODEOWNERS のレビュー必須なら必須 (ブランチ保護が無くても)', () => {
    const report = reportOf({
      rules: ok([{ type: 'deletion' }, pullRequestRule({ required_approving_review_count: 1, require_code_owner_review: true })]),
    });
    assert.equal(describeSource(report.sources[1] ?? assert.fail()), 'ruleset: 必須の承認 1 件・CODEOWNERS のレビュー 必須');
    assert.deepEqual(judgePersonReview(report), { kind: 'required', approvals: 1 });
  });

  it('pull_request 以外のルールだけの ruleset は、レビューを要求していない', () => {
    const report = reportOf({ rules: ok([{ type: 'deletion' }, { type: 'non_fast_forward' }]) });
    assert.equal(report.sources[1]?.reading.kind, 'none');
    assert.equal(judgePersonReview(report).kind, 'not-required');
  });

  it('ブランチ保護と ruleset は重なって効く: 承認数は大きい方、CODEOWNERS のレビューはどちらかが要求すれば必須', () => {
    const report = reportOf({
      protection: ok(protection({ required_approving_review_count: 1, require_code_owner_reviews: false })),
      rules: ok([pullRequestRule({ required_approving_review_count: 0, require_code_owner_review: true })]),
    });
    assert.deepEqual(judgePersonReview(report), { kind: 'required', approvals: 1 });
  });

  it('ruleset が複数の pull_request ルールを返しても、同じように合算する', () => {
    const report = reportOf({
      rules: ok([
        pullRequestRule({ required_approving_review_count: 1, require_code_owner_review: false }),
        pullRequestRule({ required_approving_review_count: 0, require_code_owner_review: true }),
      ]),
    });
    assert.deepEqual(judgePersonReview(report), { kind: 'required', approvals: 1 });
  });

  it('一方が読めず、読めた方だけでは必須と言えないときは unknown (必須でないとも言わない)', () => {
    const forbidden = httpError(403, 'Resource not accessible by personal access token');
    const report = reportOf({ protection: forbidden, rules: ok([pullRequestRule({ required_approving_review_count: 1, require_code_owner_review: false })]) });
    const verdict = judgePersonReview(report);
    assert.equal(verdict.kind, 'unknown');
    assert.ok(verdict.kind === 'unknown' && verdict.unreadable[0]?.startsWith('ブランチ保護: gh api の branches/<branch>/protection が失敗した (終了コード 1): gh: Resource not accessible'));
    assert.match(describeSource(report.sources[0] ?? assert.fail()), /^ブランチ保護: 読めない \(/);
  });

  it('読めなかった方があっても、読めた方だけで必須なら必須 (重ねて効く設定は増えるだけ)', () => {
    const report = reportOf({
      protection: httpError(403, 'Resource not accessible by personal access token'),
      rules: ok([pullRequestRule({ required_approving_review_count: 1, require_code_owner_review: true })]),
    });
    assert.deepEqual(judgePersonReview(report), { kind: 'required', approvals: 1 });
  });

  it('HTTP 404 でも `Branch not protected` 以外 (repo に権限が無い・存在しない) は「無い」ではなく読めない', () => {
    const report = reportOf({ protection: httpError(404, 'Not Found') });
    assert.equal(report.sources[0]?.reading.kind, 'unreadable');
    assert.equal(judgePersonReview(report).kind, 'unknown');
  });

  it('応答が JSON でない・形が違うときは読めない (必須でないとは言わない)', () => {
    const notJson: GhResult = { kind: 'exited', status: 0, stdout: 'not json', stderr: '' };
    assert.equal(reportOf({ protection: notJson }).sources[0]?.reading.kind, 'unreadable');
    assert.equal(reportOf({ protection: ok([1, 2]) }).sources[0]?.reading.kind, 'unreadable');
    assert.equal(reportOf({ rules: notJson }).sources[1]?.reading.kind, 'unreadable');
    assert.equal(reportOf({ rules: ok({ message: 'x' }) }).sources[1]?.reading.kind, 'unreadable');
    assert.equal(judgePersonReview(reportOf({ rules: ok({ message: 'x' }) })).kind, 'unknown');
  });

  it('既定では repo の既定ブランチを読む。--branch があればそのブランチを読む (/ を含む名前・記号は符号化する)', () => {
    const byDefault = fakeRunner({ repo: ok({ full_name: 'o/r', default_branch: 'develop' }) });
    assert.ok('report' in readBranchProtection(byDefault.run, '/repo'));
    assert.deepEqual(byDefault.calls, [
      'repos/{owner}/{repo}',
      'repos/{owner}/{repo}/branches/develop/protection',
      'repos/{owner}/{repo}/rules/branches/develop',
    ]);
    const explicit = fakeRunner({});
    const result = readBranchProtection(explicit.run, '/repo', 'release/1.0#x');
    assert.ok('report' in result);
    assert.equal(result.report.branch, 'release/1.0#x');
    assert.deepEqual(explicit.calls.slice(1), [
      'repos/{owner}/{repo}/branches/release/1.0%23x/protection',
      'repos/{owner}/{repo}/rules/branches/release/1.0%23x',
    ]);
  });

  it('gh を実行する ディレクトリを渡す', () => {
    const cwds: string[] = [];
    const run: GhRunner = (args, cwd) => {
      cwds.push(cwd);
      return args[1] === 'repos/{owner}/{repo}' ? ok(REPO) : ok([]);
    };
    readBranchProtection(run, '/the/repo');
    assert.deepEqual([...new Set(cwds)], ['/the/repo']);
  });

  it('検査不能: gh が動かない・認証できない・repo を特定できない・応答が読めない', () => {
    const cases: ReadonlyArray<readonly [GhResult, RegExp]> = [
      [{ kind: 'not-run', reason: 'gh が見つからない (PATH に無い)' }, /^repo の情報を gh で読めない: gh が見つからない \(PATH に無い\)$/],
      [
        { kind: 'exited', status: 4, stdout: '', stderr: 'gh: To get started with GitHub CLI, please run:  gh auth login\n' },
        /gh api の repos\/\{owner\}\/\{repo\} が失敗した \(終了コード 4\): gh: To get started/,
      ],
      [
        { kind: 'exited', status: 1, stdout: '', stderr: 'none of the git remotes configured for this repository point to a known GitHub host.\n' },
        /none of the git remotes/,
      ],
      [{ kind: 'exited', status: 0, stdout: '<html>', stderr: '' }, /JSON として読めない/],
      [ok({ full_name: 'o/r' }), /full_name と default_branch が無い/],
      [ok([REPO]), /full_name と default_branch が無い/],
    ];
    for (const [repo, message] of cases) {
      const result = readBranchProtection(fakeRunner({ repo }).run, '/repo');
      assert.ok('cannotCheck' in result, JSON.stringify(result));
      assert.match(result.cannotCheck, message);
    }
  });
});

describe('runGh: 実際に gh を起動する (PATH 上の偽の gh)', () => {
  function binWith(script: string | null): string {
    const dir = mkdtempSync(join(tmpdir(), 'igeta-fake-gh-'));
    workspaces.push(dir);
    if (script !== null) {
      writeFileSync(join(dir, 'gh'), `#!/bin/sh\n${script}\n`);
      chmodSync(join(dir, 'gh'), 0o755);
    }
    process.env['PATH'] = `${dir}:/usr/bin:/bin`;
    return dir;
  }

  it('標準出力・標準エラー・終了コードを返し、引数と実行ディレクトリが渡る', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'igeta-fake-gh-cwd-'));
    workspaces.push(cwd);
    binWith('echo "args: $*"; echo "cwd: $(pwd -P)"; echo oops >&2; exit 3');
    const result = runGh(['api', 'repos/{owner}/{repo}'], cwd);
    assert.equal(result.kind, 'exited');
    assert.ok(result.kind === 'exited');
    assert.equal(result.status, 3);
    assert.match(result.stdout, /args: api repos\/\{owner\}\/\{repo\}\n/);
    assert.ok(result.stdout.includes(`cwd: ${realpathSync(cwd)}\n`), result.stdout);
    assert.equal(result.stderr, 'oops\n');
  });

  it('gh が PATH に無いと not-run (検査不能の理由になる)', () => {
    binWith(null);
    assert.deepEqual(runGh(['api', 'x'], tmpdir()), { kind: 'not-run', reason: 'gh が見つからない (PATH に無い)' });
  });

  it('時間内に終わらない gh は打ち切って not-run にする (待ち続けない)', () => {
    binWith('exec sleep 5'); // exec で shell を sleep に置き換える (孫プロセスが標準出力を握ったまま残らない)
    const started = Date.now();
    const result = runGh(['api', 'x'], tmpdir(), 300);
    assert.deepEqual(result, { kind: 'not-run', reason: 'gh が 0.3 秒以内に終わらなかった' });
    assert.ok(Date.now() - started < 4000);
  });

  it('signal で終わった gh も not-run', () => {
    binWith('kill -9 $$');
    const result = runGh(['api', 'x'], tmpdir());
    assert.equal(result.kind, 'not-run');
    assert.ok(result.kind === 'not-run' && /signal SIGKILL/.test(result.reason));
  });
});
