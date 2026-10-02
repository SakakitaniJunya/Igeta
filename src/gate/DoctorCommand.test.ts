// node --test dist/gate/DoctorCommand.test.js
// igeta doctor: GitHub の保護の設定の点検。テスト仕様 01 (docs/design/test/specs/01-approval-gate.md) の表の行に 1 本ずつ対応する。
// 本物の GitHub は呼ばない。gh の応答は、記録した (または GitHub の API の説明どおりの) JSON を使う。
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Cli } from '../cli/Cli.js';
import { DoctorCommand } from '../cli/commands/DoctorCommand.js';
import { IGETA_ROOT } from '../core/Paths.js';
import { runGh } from './BranchProtection.js';
import type { GhResult, GhRunner } from './BranchProtection.js';
import { tempDir } from './ApprovalScopeFixture.js';

const savedPath = process.env['PATH'];

after(() => {
  if (savedPath === undefined) delete process.env['PATH'];
  else process.env['PATH'] = savedPath;
});

const ok = (body: unknown): GhResult => ({ kind: 'exited', status: 0, stdout: JSON.stringify(body), stderr: '' });

/** gh api が HTTP エラーのときの応答の形 (終了コード 1・本文に JSON・標準エラーに `gh: <message> (HTTP <code>)`)。 */
const httpError = (code: number, message: string, documentation: string): GhResult => ({
  kind: 'exited',
  status: 1,
  stdout: JSON.stringify({ message, documentation_url: documentation, status: String(code) }),
  stderr: `gh: ${message} (HTTP ${code})\n`,
});

const PROTECTION_DOC = 'https://docs.github.com/rest/branches/branch-protection#get-branch-protection';

// 2026-10-02 に、実際の Igeta リポジトリ (保護も ruleset も CODEOWNERS も無い) から gh api で記録した応答
const NOT_PROTECTED = httpError(404, 'Branch not protected', PROTECTION_DOC);
const NO_RULESET = ok([]);
const NO_CODEOWNERS = httpError(404, 'Not Found', 'https://docs.github.com/rest/repos/repos#list-codeowners-errors');

// GitHub の API の説明どおりの形 (従来の保護・ruleset・CODEOWNERS の誤り) と、プランによる 403
const REPO = ok({ full_name: 'SakakitaniJunya/Igeta', default_branch: 'main' });
const classic = (options: { ownerReview?: boolean; dismissStale?: boolean } = {}): GhResult =>
  ok({
    url: 'https://api.github.com/repos/SakakitaniJunya/Igeta/branches/main/protection',
    required_status_checks: { strict: true, contexts: ['ci'] },
    enforce_admins: { enabled: true },
    required_pull_request_reviews: {
      dismiss_stale_reviews: options.dismissStale ?? true,
      require_code_owner_reviews: options.ownerReview ?? true,
      require_last_push_approval: false,
      required_approving_review_count: 1,
    },
  });
const RULESET = ok([
  {
    type: 'pull_request',
    parameters: {
      required_approving_review_count: 1,
      dismiss_stale_reviews_on_push: true,
      require_code_owner_review: true,
      require_last_push_approval: false,
      required_review_thread_resolution: false,
    },
    ruleset_source_type: 'Repository',
    ruleset_source: 'SakakitaniJunya/Igeta',
    ruleset_id: 42,
  },
]);
const CODEOWNERS_OK = ok({ errors: [] });
const CODEOWNERS_ERROR = ok({
  errors: [
    {
      line: 3,
      column: 1,
      kind: 'Invalid owner',
      source: 'docs/person/ @nobody',
      suggestion: 'The owner `@nobody` does not exist.',
      message: 'Invalid owner on line 3:\n\n  docs/person/ @nobody\n  ^',
      path: '.github/CODEOWNERS',
    },
  ],
});
const PLAN_LIMIT = httpError(403, 'Upgrade to GitHub Pro or make this repository public to enable this feature.', PROTECTION_DOC);
const NO_ADMIN = httpError(403, 'Must have admin rights to Repository.', PROTECTION_DOC);

interface Responses {
  readonly classic?: GhResult;
  readonly rules?: GhResult;
  readonly owners?: GhResult;
}

/** 呼ばれた API のパスに応じて、記録した応答を返す gh。省略した応答は、4 つがそろった設定のもの。 */
const gh =
  (responses: Responses): GhRunner =>
  (args) => {
    const path = args[1] ?? '';
    if (path === 'repos/{owner}/{repo}') return REPO;
    if (path.endsWith('/protection')) return responses.classic ?? classic();
    if (path.includes('/rules/branches/')) return responses.rules ?? NO_RULESET;
    if (path.endsWith('/codeowners/errors')) return responses.owners ?? CODEOWNERS_OK;
    throw new Error(`想定外の gh api: ${path}`);
  };

interface Run {
  readonly code: number;
  readonly stdout: readonly string[];
  readonly stderr: readonly string[];
}

async function doctor(runGh?: GhRunner): Promise<Run> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const command = new DoctorCommand(runGh === undefined ? {} : { runGh });
  const code = await new Cli().register(command).run(['doctor'], {
    cwd: IGETA_ROOT,
    igetaRoot: IGETA_ROOT,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  return { code, stdout, stderr };
}

const ITEMS = [
  'PR が必須',
  'CODEOWNERS の持ち主のレビューが必須',
  '新しい push で承認を取り消す',
  'GitHub が返す CODEOWNERS の誤りが 0 件',
] as const;
const NOT_CHECKED = ['持ち主が実在し', '管理者の迂回', '必須の検査', '既定ブランチ以外の保護'] as const;

/** 4 つの項目と、確かめないこと 4 点が、出力に 1 つずつある。 */
function assertListsEverything(run: Run, label: string): void {
  for (const item of ITEMS) {
    assert.equal(run.stdout.filter((line) => line.includes(item)).length, 1, `${label}: 項目「${item}」が 1 行で出る`);
  }
  for (const text of NOT_CHECKED) {
    assert.equal(run.stdout.filter((line) => line.startsWith('  - ') && line.includes(text)).length, 1, `${label}: 確かめないこと「${text}」`);
  }
}

describe('igeta doctor: GitHub の保護の点検', () => {
  it('[TST-107] 4 つがそろった設定 (従来の保護の形・ruleset の形) は適合・0。出力に 4 つの項目と、確かめないこと 4 点', async () => {
    const forms: ReadonlyArray<readonly [name: string, responses: Responses]> = [
      ['従来の保護の形', { classic: classic() }],
      ['ruleset の形', { classic: NOT_PROTECTED, rules: RULESET }],
    ];
    for (const [name, responses] of forms) {
      const run = await doctor(gh(responses));
      assert.equal(run.code, 0, `${name}: ${run.stderr.join(' | ')}`);
      assertListsEverything(run, name);
      for (const item of ITEMS) assert.ok(run.stdout.some((line) => line.startsWith(`  OK ${item}`)), `${name}: ${item}`);
      assert.deepEqual(run.stderr, [], name);
    }
  });

  it('[TST-312] 設定が欠ける (保護なし・持ち主のレビューが任意・承認を取り消さない・CODEOWNERS の誤り・CODEOWNERS なし・契約で使えない) と違反・1', async () => {
    const cases: ReadonlyArray<readonly [name: string, responses: Responses, missing: string]> = [
      ['保護も ruleset も無い', { classic: NOT_PROTECTED }, 'PR が必須'],
      ['持ち主のレビューが任意', { classic: classic({ ownerReview: false }) }, 'CODEOWNERS の持ち主のレビューが必須'],
      ['新しい push で承認を取り消さない', { classic: classic({ dismissStale: false }) }, '新しい push で承認を取り消す'],
      ['GitHub が CODEOWNERS の誤りを 1 件返す', { owners: CODEOWNERS_ERROR }, 'GitHub が返す CODEOWNERS の誤りが 0 件'],
      ['CODEOWNERS が無い (404)', { owners: NO_CODEOWNERS }, 'GitHub が返す CODEOWNERS の誤りが 0 件'],
      ['GitHub が「この契約では使えない」と返す', { classic: PLAN_LIMIT, rules: PLAN_LIMIT }, 'PR が必須'],
    ];
    for (const [name, responses, missing] of cases) {
      const run = await doctor(gh(responses));
      assert.equal(run.code, 1, `${name}: ${run.stdout.join(' | ')} ${run.stderr.join(' | ')}`);
      assert.ok(run.stdout.some((line) => line.startsWith(`  NG ${missing}`)), `${name}: 欠けた項目「${missing}」が NG で出る`);
      assert.ok(run.stderr.some((line) => line.startsWith('VIOLATION ') && line.includes(missing)), name);
      assertListsEverything(run, name);
    }
  });

  it('[TST-313] gh が無い・権限が無くて設定を読めない・時間内に終わらないと、検査不能・2 (成功にしない)', async () => {
    // gh が PATH に無い: 実際の gh の呼び出し (差し替えない) で確かめる
    process.env['PATH'] = tempDir('igeta-doctor-no-gh-');
    const missing = await doctor();
    process.env['PATH'] = savedPath ?? '';
    assert.equal(missing.code, 2);
    assert.deepEqual(missing.stdout, []);
    assert.match(missing.stderr.join('\n'), /^CANNOT-CHECK .*gh が見つからない/);

    // 従来の保護を読む権限が無い (ruleset は読める): 3 つの項目は、満たすとも満たさないとも言えない
    const noPermission = await doctor(gh({ classic: NO_ADMIN }));
    assert.equal(noPermission.code, 2, noPermission.stderr.join(' | '));
    assert.match(noPermission.stderr.join('\n'), /CANNOT-CHECK .*Must have admin rights/);
    assert.ok(!noPermission.stdout.some((line) => line.startsWith('OK ')), 'OK を出さない');

    // gh が時間内に終わらない: 応答しない偽の gh を PATH に置く。時間切れ (既定は 60 秒) は、待たずに済むよう短い時間に差し替える
    const bin = tempDir('igeta-doctor-slow-gh-');
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\nexec sleep 5\n');
    chmodSync(join(bin, 'gh'), 0o755);
    process.env['PATH'] = `${bin}:/usr/bin:/bin`;
    const started = Date.now();
    const slow = await doctor((args, cwd) => runGh(args, cwd, 300));
    process.env['PATH'] = savedPath ?? '';
    assert.equal(slow.code, 2);
    assert.deepEqual(slow.stdout, []);
    assert.match(slow.stderr.join('\n'), /^CANNOT-CHECK .*gh が 0\.3 秒以内に終わらなかった/);
    assert.ok(Date.now() - started < 4000, '時間切れで待ちを打ち切る');
  });
});
