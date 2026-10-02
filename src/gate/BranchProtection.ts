// GitHub の保護の設定を gh で読み、人の承認が実際に求められる設定かを点検する (`igeta doctor`)。
// Spec: docs/design/test/specs/01-approval-gate.md (R7)、docs/adr/0008-human-approval-scope.md 決定 2・6
//
// 読むのは既定ブランチの保護 (従来のブランチ保護と ruleset) と、GitHub が返す CODEOWNERS の誤りだけで、次の 4 つを
// 1 つずつ点検する: PR が必須 / CODEOWNERS の持ち主のレビューが必須 / 新しい push で承認を取り消す /
// CODEOWNERS の誤りが 0 件。従来の保護と ruleset は同じブランチに重なって効くので、どちらかが満たしていれば満たす。
// 欠けていれば違反、gh が無い・権限が無くて読めない・60 秒で終わらなければ検査不能 (黙って成功にしない)。確かめないことは
// NOT_CHECKED。

import { spawnSync } from 'node:child_process';

export type GhResult =
  | { readonly kind: 'exited'; readonly status: number; readonly stdout: string; readonly stderr: string }
  /** gh を動かせなかった (PATH に無いなど)。reason は利用者に見せる */
  | { readonly kind: 'not-run'; readonly reason: string };

export type GhRunner = (args: readonly string[], cwd: string) => GhResult;

/** gh が応答しないまま、点検が止まり続けないための時間切れ (R7)。 */
const GH_TIMEOUT_MS = 60_000;

/** gh を実行する。timeoutMs を過ぎても終わらなければ打ち切って not-run にする (テストが短い時間に差し替える)。 */
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

/** 確かめないこと (ADR-0008 の限界)。点検が通ったときも出力に書く。 */
export const NOT_CHECKED: readonly string[] = [
  '持ち主が実在し、書き込み権限を持つか',
  '管理者の迂回',
  '必須の検査',
  '既定ブランチ以外の保護',
];

/** 従来のブランチ保護か ruleset の 1 つを読んだ結果。 */
export type Layer =
  /** 設定を読めた。PR を要求しない保護も、全部 false で読める */
  | { readonly kind: 'read'; readonly pullRequest: boolean; readonly ownerReview: boolean; readonly dismissStale: boolean }
  /** 保護・ruleset が置かれていない */
  | { readonly kind: 'absent' }
  /** GitHub が「この契約では使えない」と返した */
  | { readonly kind: 'unavailable'; readonly message: string }
  /** 権限が無い・応答を読めないなどで、読めなかった */
  | { readonly kind: 'unreadable'; readonly reason: string };

export interface NamedLayer {
  readonly name: 'ブランチ保護' | 'ruleset';
  readonly layer: Layer;
}

/** GitHub が返す CODEOWNERS の誤りの問い合わせ (`codeowners/errors`) の結果。 */
export type CodeownersReading =
  | { readonly kind: 'ok'; readonly errors: readonly string[] }
  /** 404: CODEOWNERS が無い */
  | { readonly kind: 'missing' }
  | { readonly kind: 'unavailable'; readonly message: string }
  | { readonly kind: 'unreadable'; readonly reason: string };

export interface ProtectionReport {
  /** `owner/name` */
  readonly repo: string;
  readonly branch: string;
  readonly layers: readonly NamedLayer[];
  readonly codeowners: CodeownersReading;
}

export type ReadResult = { readonly report: ProtectionReport } | { readonly cannotCheck: string };

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

/** `gh api` の結果。成功なら本文、失敗なら GitHub の応答の種類と理由。 */
type ApiOutcome =
  | { readonly kind: 'body'; readonly body: unknown }
  | { readonly kind: 'not-protected' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unavailable'; readonly message: string }
  | { readonly kind: 'failed'; readonly reason: string };

// 保護も ruleset も置けない契約のときに GitHub が返す文 (403)。契約の問題なので、読めなかったのではなく、使えない
const CONTRACT_MESSAGE = /upgrade to github|make this repository public/i;

function callApi(run: GhRunner, cwd: string, path: string): ApiOutcome {
  const result = run(['api', path], cwd);
  if (result.kind === 'not-run') return { kind: 'failed', reason: result.reason };
  if (result.status === 0) {
    const body = parseJson(result.stdout);
    return body === undefined ? { kind: 'failed', reason: `gh api ${path} の出力を JSON として読めない` } : { kind: 'body', body };
  }
  const error = parseJson(result.stdout);
  const message = isObject(error) && typeof error['message'] === 'string' ? error['message'] : '';
  if (CONTRACT_MESSAGE.test(message)) return { kind: 'unavailable', message };
  if (message === 'Branch not protected') return { kind: 'not-protected' };
  if ((isObject(error) && error['status'] === '404') || /\(HTTP 404\)/.test(result.stderr)) return { kind: 'not-found' };
  return { kind: 'failed', reason: `gh api ${path} が失敗した (終了コード ${result.status}): ${firstLine(result.stderr)}` };
}

const encodeBranch = (branch: string): string => branch.split('/').map(encodeURIComponent).join('/');

function readClassic(outcome: ApiOutcome): Layer {
  // 保護の無いブランチは 404 `Branch not protected`。ただの 404 Not Found は、権限が無いときにも返るので、「無い」とは言わない
  if (outcome.kind === 'not-protected') return { kind: 'absent' };
  if (outcome.kind === 'not-found') return { kind: 'unreadable', reason: 'ブランチ保護の問い合わせが 404 Not Found' };
  if (outcome.kind === 'unavailable') return { kind: 'unavailable', message: outcome.message };
  if (outcome.kind === 'failed') return { kind: 'unreadable', reason: outcome.reason };
  if (!isObject(outcome.body)) return { kind: 'unreadable', reason: 'ブランチ保護の応答がオブジェクトでない' };
  const reviews = outcome.body['required_pull_request_reviews'];
  return {
    kind: 'read',
    pullRequest: isObject(reviews),
    ownerReview: isObject(reviews) && reviews['require_code_owner_reviews'] === true,
    dismissStale: isObject(reviews) && reviews['dismiss_stale_reviews'] === true,
  };
}

function readRuleset(outcome: ApiOutcome): Layer {
  if (outcome.kind === 'not-protected' || outcome.kind === 'not-found') return { kind: 'unreadable', reason: 'ruleset の問い合わせが 404' };
  if (outcome.kind === 'unavailable') return { kind: 'unavailable', message: outcome.message };
  if (outcome.kind === 'failed') return { kind: 'unreadable', reason: outcome.reason };
  if (!Array.isArray(outcome.body)) return { kind: 'unreadable', reason: 'ruleset の応答が配列でない' };
  const rules: readonly unknown[] = outcome.body;
  const pullRequestRules = rules.filter((rule): rule is JsonObject => isObject(rule) && rule['type'] === 'pull_request');
  if (pullRequestRules.length === 0) return { kind: 'absent' };
  const parameters = pullRequestRules.map((rule) => (isObject(rule['parameters']) ? rule['parameters'] : {}));
  return {
    kind: 'read',
    pullRequest: true,
    ownerReview: parameters.some((p) => p['require_code_owner_review'] === true),
    dismissStale: parameters.some((p) => p['dismiss_stale_reviews_on_push'] === true),
  };
}

function readCodeowners(outcome: ApiOutcome): CodeownersReading {
  if (outcome.kind === 'not-found' || outcome.kind === 'not-protected') return { kind: 'missing' };
  if (outcome.kind === 'unavailable') return { kind: 'unavailable', message: outcome.message };
  if (outcome.kind === 'failed') return { kind: 'unreadable', reason: outcome.reason };
  const errors = isObject(outcome.body) ? outcome.body['errors'] : undefined;
  if (!Array.isArray(errors)) return { kind: 'unreadable', reason: 'CODEOWNERS の誤りの応答に errors が無い' };
  const messages: readonly unknown[] = errors;
  return {
    kind: 'ok',
    errors: messages.map((error) => {
      if (!isObject(error)) return String(error);
      const where = typeof error['path'] === 'string' && typeof error['line'] === 'number' ? `${error['path']}:${error['line']} ` : '';
      return `${where}${typeof error['kind'] === 'string' ? error['kind'] : '誤り'}`;
    }),
  };
}

/**
 * repo の既定ブランチの保護と、CODEOWNERS の誤りを gh で読む。gh が動かない・認証できない・repo を特定できないときは
 * 検査不能。個々の設定が読めなかったことは、report の中に残す。
 */
export function readDefaultBranchProtection(run: GhRunner, cwd: string): ReadResult {
  const info = callApi(run, cwd, 'repos/{owner}/{repo}');
  if (info.kind !== 'body') {
    const reason = info.kind === 'failed' ? info.reason : info.kind === 'unavailable' ? info.message : 'repo が見つからない (HTTP 404)';
    return { cannotCheck: `repo の情報を gh で読めない: ${reason}` };
  }
  const repo = isObject(info.body) ? info.body['full_name'] : undefined;
  const branch = isObject(info.body) ? info.body['default_branch'] : undefined;
  if (typeof repo !== 'string' || typeof branch !== 'string') {
    return { cannotCheck: 'repo の情報を gh で読めない: 出力に full_name と default_branch が無い' };
  }
  const encoded = encodeBranch(branch);
  return {
    report: {
      repo,
      branch,
      layers: [
        { name: 'ブランチ保護', layer: readClassic(callApi(run, cwd, `repos/{owner}/{repo}/branches/${encoded}/protection`)) },
        { name: 'ruleset', layer: readRuleset(callApi(run, cwd, `repos/{owner}/{repo}/rules/branches/${encoded}`)) },
      ],
      codeowners: readCodeowners(callApi(run, cwd, 'repos/{owner}/{repo}/codeowners/errors')),
    },
  };
}

export type ItemState = 'ok' | 'missing' | 'unknown';

export interface Item {
  readonly label: string;
  readonly state: ItemState;
  /** どの設定が満たす・満たさないか。表示と違反の説明に出す */
  readonly detail: string;
}

function describeLayer(layer: Layer): string {
  if (layer.kind === 'read') return 'この項目を要求していない';
  if (layer.kind === 'absent') return 'なし';
  if (layer.kind === 'unavailable') return `この契約では使えない (GitHub: ${layer.message})`;
  return `読めない (${layer.reason})`;
}

/** 3 つの項目の 1 つ。どれかの設定が満たせば満たす。満たす設定が無く、読めなかった設定があれば不明。 */
function layerItem(report: ProtectionReport, label: string, provides: (layer: Layer & { kind: 'read' }) => boolean): Item {
  const providers = report.layers.filter(({ layer }) => layer.kind === 'read' && provides(layer));
  if (providers.length > 0) return { label, state: 'ok', detail: providers.map(({ name }) => name).join('・') };
  const detail = report.layers.map(({ name, layer }) => `${name}: ${describeLayer(layer)}`).join(' / ');
  const unreadable = report.layers.some(({ layer }) => layer.kind === 'unreadable');
  return { label, state: unreadable ? 'unknown' : 'missing', detail };
}

/** 4 つの項目を 1 つずつ点検する。 */
export function inspectProtection(report: ProtectionReport): readonly Item[] {
  const codeowners = report.codeowners;
  let owners: Item;
  const label = 'GitHub が返す CODEOWNERS の誤りが 0 件';
  if (codeowners.kind === 'ok') {
    owners =
      codeowners.errors.length === 0
        ? { label, state: 'ok', detail: '0 件' }
        : { label, state: 'missing', detail: `${codeowners.errors.length} 件: ${codeowners.errors.join(' / ')}` };
  } else if (codeowners.kind === 'missing') {
    owners = { label, state: 'missing', detail: 'CODEOWNERS が無い (誤りの問い合わせが 404)' };
  } else if (codeowners.kind === 'unavailable') {
    owners = { label, state: 'missing', detail: `この契約では使えない (GitHub: ${codeowners.message})` };
  } else {
    owners = { label, state: 'unknown', detail: `読めない (${codeowners.reason})` };
  }
  return [
    layerItem(report, 'PR が必須', (layer) => layer.pullRequest),
    layerItem(report, 'CODEOWNERS の持ち主のレビューが必須', (layer) => layer.ownerReview),
    layerItem(report, '新しい push で承認を取り消す', (layer) => layer.dismissStale),
    owners,
  ];
}
