// 人の承認が要る変更を、差分のパスで見分ける (`igeta approval-scope`)。
// Spec: docs/adr/0008-human-approval-scope.md、docs/adr/0002-role-boundary-invariants.md 条件 12
//
// 判定は差分に含まれるパスだけで決める。書いた主体・コミットの文面・変更の大きさは見ない。
// `human` が 1 つでもあれば全体が `human`。どれにも当たらなければ `ai`。判定できないときは `ai` を返さず、
// 検査不能 (violation: cannot-check) を返す。
//
// 判定の表 (ADR-0008 決定 1):
//   docs/person/**・docs/client/**                          → human
//   .github/CODEOWNERS・.github/workflows/**・.igeta.json・AGENTS.md → human (門を決めるファイル)
//   .igeta.json の humanPaths に当たるパス                  → human
//   上のどれも無い                                          → ai
// ファイルの中身は見ない (package.json・ロックファイル・README の生成区間も、パスだけで決める)。

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadIgetaConfig } from '../core/IgetaConfig.js';
import type { Violation } from '../core/Report.js';
import { GitError, GitRepo } from './GitRepo.js';
import { matchesGlob } from './PathGlob.js';
import { ROLE_FOLDERS } from './RoleFolders.js';

export type ApprovalVerdict = 'human' | 'ai';

/** 差分の起点の指定。`ci` は CI が渡した保護ブランチの名前、`local` は手元の確認用の ref。 */
export type BaseSpec =
  | { readonly mode: 'ci'; readonly branch: string }
  | { readonly mode: 'local'; readonly ref: string };

export interface ResolvedBase {
  readonly mode: 'ci' | 'local';
  /** 指定された ref (CI では origin/<保護ブランチ>)。出力に出す */
  readonly ref: string;
  /** その ref と HEAD の merge-base (差分の起点) */
  readonly commit: string;
}

export interface ScopeReason {
  readonly path: string;
  /** そのパスが人の承認を要する (または判定から除かれた) 理由 */
  readonly rule: string;
}

export interface ScopeJudgement {
  readonly verdict: ApprovalVerdict;
  /** 人の承認が要る理由になったパス。`human` のとき 1 件以上、`ai` のとき空 */
  readonly reasons: readonly ScopeReason[];
  readonly changedCount: number;
  readonly base: ResolvedBase;
}

export type ScopeResult = { readonly judgement: ScopeJudgement } | { readonly violation: Violation };

export interface ApprovalScopeOptions {
  /** 検査対象 repo のルート (git の作業ツリーの最上位) */
  readonly root: string;
  /** Igeta パッケージ自身のルート (docs-graph を呼ぶときの検査の文脈) */
  readonly igetaRoot: string;
  readonly base: BaseSpec;
}

const GATE_FILE = '門を決めるファイル';

/** 固定の規則。パスがこの glob のどれかに当たれば `human`。 */
const FIXED_RULES: ReadonlyArray<{ readonly glob: string; readonly rule: string }> = [
  { glob: 'docs/person/**', rule: 'docs/person/ の文書' },
  { glob: 'docs/client/**', rule: 'docs/client/ の文書' },
  { glob: '.github/CODEOWNERS', rule: GATE_FILE },
  { glob: '.github/workflows/**', rule: GATE_FILE },
  { glob: '.igeta.json', rule: GATE_FILE },
  { glob: 'AGENTS.md', rule: GATE_FILE },
];

const cannotCheck = (message: string): { readonly violation: Violation } => ({
  violation: { severity: 'cannot-check', message },
});

const isDirectory = (path: string): boolean => existsSync(path) && statSync(path).isDirectory();

/** 起点を決める。CI は保護ブランチ名から origin/<名前> を引く。決められなければ理由の文字列を返す。 */
function resolveBase(repo: GitRepo, spec: BaseSpec): ResolvedBase | string {
  let ref: string;
  if (spec.mode === 'ci') {
    ref = `refs/remotes/origin/${spec.branch}`;
    if (!repo.isValidRefName(ref)) return `CI が渡した保護ブランチの名前が ref として正しくない: ${JSON.stringify(spec.branch)}`;
  } else {
    ref = spec.ref;
  }
  const tip = repo.commitOf(ref);
  if (tip === null) {
    return spec.mode === 'ci'
      ? `起点の ${ref} が無い。actions/checkout に fetch-depth: 0 を指定して保護ブランチの履歴を取る`
      : `--base ${spec.ref} が commit として解決できない`;
  }
  const commit = repo.mergeBase(tip, 'HEAD');
  if (commit === null) {
    return `${ref} と HEAD に共通の祖先が無く merge-base を決められない (浅い clone の可能性。fetch-depth: 0 で履歴を取る)`;
  }
  return { mode: spec.mode, ref: spec.mode === 'ci' ? `origin/${spec.branch}` : spec.ref, commit };
}

/**
 * パスだけで決まる規則 (固定の規則と humanPaths)。当たらなければ null。
 * 大文字小文字は区別しない (PathGlob.ts): 大文字小文字を区別しないファイルシステムでは `docs/Person/` も
 * `docs/person/` と同じ場所になるので、大文字小文字だけを変えたパスで門を抜けられないようにする。
 */
export function pathRule(path: string, humanPaths: readonly string[]): string | null {
  for (const { glob, rule } of FIXED_RULES) {
    if (matchesGlob(path, glob)) return rule;
  }
  for (const glob of humanPaths) {
    if (matchesGlob(path, glob)) return `humanPaths: ${glob}`;
  }
  return null;
}

const byPath = (a: ScopeReason, b: ScopeReason): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export async function judgeApprovalScope(options: ApprovalScopeOptions): Promise<ScopeResult> {
  try {
    return await judge(options);
  } catch (error) {
    if (error instanceof GitError) return cannotCheck(error.message);
    throw error;
  }
}

async function judge(options: ApprovalScopeOptions): Promise<ScopeResult> {
  const { root } = options;

  // 旧い構成の repo では `person/` が無く、どの差分も `ai` に見えてしまう。判定できないので `ai` を返さない
  if (!ROLE_FOLDERS.some((folder) => isDirectory(join(root, folder)))) {
    return cannotCheck(
      `旧い構成の repo (${ROLE_FOLDERS.join('・')} のどれも無い) では、人の承認が要る変更を判定できない。` +
        'ADR-0003 の手順で移行してから実行する',
    );
  }

  // humanPaths は作業ツリーの .igeta.json から読む。.igeta.json の変更は常に `human` なので、humanPaths を
  // 減らす変更は、同じ差分の中で守られていたパスが `ai` に見えるようになっても、人の承認を通る
  const loaded = loadIgetaConfig(root);
  if ('violation' in loaded) return cannotCheck(`.igeta.json を使えないので判定できない: ${loaded.violation.message}`);
  const { humanPaths } = loaded.config;

  const repo = new GitRepo(root);
  if (!repo.isTopLevel()) {
    return cannotCheck(`${root} は git の作業ツリーの最上位ではない。repo 直下のパスで判定するので、最上位で実行する`);
  }
  const base = resolveBase(repo, options.base);
  if (typeof base === 'string') return cannotCheck(base);

  const changes = repo.changes(base.commit);
  const reasons: ScopeReason[] = [];
  for (const change of changes) {
    const rule = pathRule(change.path, humanPaths);
    if (rule !== null) reasons.push({ path: change.path, rule });
  }

  reasons.sort(byPath);
  return {
    judgement: {
      verdict: reasons.length > 0 ? 'human' : 'ai',
      reasons,
      changedCount: changes.length,
      base,
    },
  };
}

// 理由のパスに改行などが入っていても、出力の行を偽造できないようにする
const displayPath = (path: string): string => (/[\u0000-\u001f\u007f]/.test(path) ? JSON.stringify(path) : path);

/**
 * 出力。1 行目は `human` か `ai`、続けて理由になったパスの一覧 (`- <パス> (<理由>)`)。
 * 空行のあとに、起点・件数・手元の確認用である旨の注記を付ける。
 */
export function formatJudgement(judgement: ScopeJudgement): readonly string[] {
  const { base } = judgement;
  const lines: string[] = [judgement.verdict];
  for (const reason of judgement.reasons) lines.push(`- ${displayPath(reason.path)} (${reason.rule})`);
  lines.push('');
  lines.push(`起点: ${base.ref} との merge-base ${base.commit.slice(0, 12)}${base.mode === 'ci' ? ' (--ci)' : ''}`);
  lines.push(`変更 ${judgement.changedCount} 件のうち、人の承認が要るもの ${judgement.reasons.length} 件`);
  if (base.mode === 'local') {
    lines.push('手元の確認用 (--base)。CI の判定は --ci が保護ブランチとの merge-base で行う');
  }
  return lines;
}
