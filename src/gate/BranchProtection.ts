// 保護ブランチの設定 (必須のレビュー・CODEOWNERS のレビュー) を gh で読み、docs/person/ の変更に人のレビューが
// 必須になっているかを確かめる (`igeta doctor`)。
// Spec: docs/adr/0008-human-approval-scope.md「限界」(2)
//
// GitHub の保護ブランチの設定は Igeta の検査からは見えない。gh で読めたときだけ確かめ、読めなければ
// 検査不能にする (黙って成功にしない)。読む先は 2 つ: 従来のブランチ保護と ruleset。どちらも同じブランチに
// 重なって効くので、必須の承認数は大きい方、CODEOWNERS のレビューはどちらかが要求していれば必須とみなす。

import { spawnSync } from 'node:child_process';

export type GhResult =
  | { readonly kind: 'exited'; readonly status: number; readonly stdout: string; readonly stderr: string }
  /** gh を動かせなかった (PATH に無い・時間切れなど)。reason は利用者に見せる */
  | { readonly kind: 'not-run'; readonly reason: string };

export type GhRunner = (args: readonly string[], cwd: string) => GhResult;

const GH_TIMEOUT_MS = 60_000;

export function runGh(args: readonly string[], cwd: string, timeoutMs: number = GH_TIMEOUT_MS): GhResult {
  const result = spawnSync('gh', [...args], { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
  if (result.error !== undefined) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { kind: 'not-run', reason: 'gh が見つからない (PATH に無い)' };
    if (code === 'ETIMEDOUT') return { kind: 'not-run', reason: `gh が ${timeoutMs / 1000} 秒以内に終わらなかった` };
    return { kind: 'not-run', reason: `gh を実行できない: ${result.error.message}` };
  }
  if (result.status === null) return { kind: 'not-run', reason: `gh が signal ${String(result.signal)} で終わった` };
  return { kind: 'exited', status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** 1 つの設定の読み取り結果。 */
export type SourceReading =
  /** PR のレビューを要求する設定を読めた */
  | { readonly kind: 'rule'; readonly approvals: number; readonly codeOwnerReview: boolean }
  /** 読めたが、PR のレビューを要求していない (設定が無い・レビューの項目が無い) */
  | { readonly kind: 'none'; readonly note: string }
  | { readonly kind: 'unreadable'; readonly reason: string };

export interface ProtectionSource {
  readonly name: 'ブランチ保護' | 'ruleset';
  readonly reading: SourceReading;
}

export interface ProtectionReport {
  /** `owner/name` */
  readonly repo: string;
  readonly branch: string;
  readonly sources: readonly ProtectionSource[];
}

export type ProtectionResult = { readonly report: ProtectionReport } | { readonly cannotCheck: string };

type JsonObject = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);
const firstLine = (text: string): string => text.trim().split('\n')[0] ?? '';

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** 成功した gh api の本文。gh が動かない・失敗したときは、その理由。 */
function apiBody(result: GhResult, what: string): { readonly body: unknown } | { readonly failure: string; readonly stdout?: string } {
  if (result.kind === 'not-run') return { failure: result.reason };
  if (result.status !== 0) {
    return { failure: `${what} が失敗した (終了コード ${result.status}): ${firstLine(result.stderr)}`, stdout: result.stdout };
  }
  const body = parseJson(result.stdout);
  if (body === undefined) return { failure: `${what} の出力を JSON として読めない` };
  return { body };
}

const encodeBranch = (branch: string): string => branch.split('/').map(encodeURIComponent).join('/');

function readClassicProtection(run: GhRunner, cwd: string, branch: string): SourceReading {
  const what = 'gh api の branches/<branch>/protection';
  const result = apiBody(run(['api', `repos/{owner}/{repo}/branches/${encodeBranch(branch)}/protection`], cwd), what);
  if ('failure' in result) {
    // 保護が無いブランチは HTTP 404 `Branch not protected`。読めなかったのではなく「設定が無い」と読めた
    const errorBody = result.stdout === undefined ? undefined : parseJson(result.stdout);
    const notProtected = isObject(errorBody) && errorBody['message'] === 'Branch not protected';
    return notProtected ? { kind: 'none', note: 'ブランチ保護が設定されていない' } : { kind: 'unreadable', reason: result.failure };
  }
  if (!isObject(result.body)) return { kind: 'unreadable', reason: `${what} の出力がオブジェクトでない` };
  const reviews = result.body['required_pull_request_reviews'];
  if (!isObject(reviews)) return { kind: 'none', note: 'PR のレビューを要求していない' };
  const approvals = reviews['required_approving_review_count'];
  return {
    kind: 'rule',
    approvals: typeof approvals === 'number' ? approvals : 0,
    codeOwnerReview: reviews['require_code_owner_reviews'] === true,
  };
}

function readRulesets(run: GhRunner, cwd: string, branch: string): SourceReading {
  const what = 'gh api の rules/branches/<branch>';
  const result = apiBody(run(['api', `repos/{owner}/{repo}/rules/branches/${encodeBranch(branch)}`], cwd), what);
  if ('failure' in result) return { kind: 'unreadable', reason: result.failure };
  if (!Array.isArray(result.body)) return { kind: 'unreadable', reason: `${what} の出力が配列でない` };
  const rules: readonly unknown[] = result.body;
  let found = false;
  let approvals = 0;
  let codeOwnerReview = false;
  for (const rule of rules) {
    if (!isObject(rule) || rule['type'] !== 'pull_request') continue;
    found = true;
    const parameters = rule['parameters'];
    if (!isObject(parameters)) continue;
    const count = parameters['required_approving_review_count'];
    if (typeof count === 'number') approvals = Math.max(approvals, count);
    if (parameters['require_code_owner_review'] === true) codeOwnerReview = true;
  }
  return found ? { kind: 'rule', approvals, codeOwnerReview } : { kind: 'none', note: 'PR のレビューを要求する ruleset が無い' };
}

/**
 * repo の保護ブランチ (既定は既定ブランチ) の設定を gh で読む。gh が動かない・認証できない・repo を特定できないときは
 * 検査不能。個々の設定 (ブランチ保護・ruleset) が読めなかったことは report の中に残す。
 */
export function readBranchProtection(run: GhRunner, cwd: string, branchOption?: string): ProtectionResult {
  const repoInfo = apiBody(run(['api', 'repos/{owner}/{repo}'], cwd), 'gh api の repos/{owner}/{repo}');
  if ('failure' in repoInfo) return { cannotCheck: `repo の情報を gh で読めない: ${repoInfo.failure}` };
  const body = repoInfo.body;
  const repo = isObject(body) ? body['full_name'] : undefined;
  const defaultBranch = isObject(body) ? body['default_branch'] : undefined;
  if (typeof repo !== 'string' || typeof defaultBranch !== 'string') {
    return { cannotCheck: 'repo の情報を gh で読めない: 出力に full_name と default_branch が無い' };
  }
  const branch = branchOption ?? defaultBranch;
  return {
    report: {
      repo,
      branch,
      sources: [
        { name: 'ブランチ保護', reading: readClassicProtection(run, cwd, branch) },
        { name: 'ruleset', reading: readRulesets(run, cwd, branch) },
      ],
    },
  };
}

export type PersonReviewVerdict =
  | { readonly kind: 'required'; readonly approvals: number }
  | { readonly kind: 'not-required'; readonly approvals: number; readonly codeOwnerReview: boolean }
  /** 読めなかった設定があり、読めた設定だけでは必須と言えない */
  | { readonly kind: 'unknown'; readonly unreadable: readonly string[] };

/** docs/person/ の変更に人のレビューが必須か。承認が 1 件以上 かつ CODEOWNERS のレビューが必須のときだけ必須。 */
export function judgePersonReview(report: ProtectionReport): PersonReviewVerdict {
  let approvals = 0;
  let codeOwnerReview = false;
  const unreadable: string[] = [];
  for (const { name, reading } of report.sources) {
    if (reading.kind === 'rule') {
      approvals = Math.max(approvals, reading.approvals);
      codeOwnerReview ||= reading.codeOwnerReview;
    } else if (reading.kind === 'unreadable') {
      unreadable.push(`${name}: ${reading.reason}`);
    }
  }
  if (approvals >= 1 && codeOwnerReview) return { kind: 'required', approvals };
  if (unreadable.length > 0) return { kind: 'unknown', unreadable };
  return { kind: 'not-required', approvals, codeOwnerReview };
}

/** 設定の表示 (1 つにつき 1 行)。 */
export function describeSource(source: ProtectionSource): string {
  const { reading } = source;
  if (reading.kind === 'rule') {
    return `${source.name}: 必須の承認 ${reading.approvals} 件・CODEOWNERS のレビュー ${reading.codeOwnerReview ? '必須' : '不要'}`;
  }
  if (reading.kind === 'none') return `${source.name}: ${reading.note}`;
  return `${source.name}: 読めない (${reading.reason})`;
}
