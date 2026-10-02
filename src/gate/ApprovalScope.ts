// 人の承認が要るパスに、変更が触れたかを見分ける (`igeta approval-scope`)。
// Spec: docs/design/test/specs/01-approval-gate.md (R1〜R6)、docs/adr/0008-human-approval-scope.md 決定 1・3
//
// 判定は、変わったパスだけで決める (ファイルの中身・書いた主体・変更の大きさは見ない)。次の 2 つの差分のパスの
// 和集合を、決定 1 の表と humanPaths に当てる。1 つでも当たれば `human`、当たらなければ `ai`。
//   (a) 枝分かれの点 (宛先の先端と HEAD の merge-base) から HEAD まで。`--base` のときだけ、作業ツリーの変更と
//       未追跡のファイルも含める
//   (b) 宛先の先端から、宛先の先端と HEAD を merge した結果まで。宛先でファイルが移された後に、古い枝が旧いパスを
//       編集していると、(a) には旧いパスしか出ないが、(b) には移した先のパスが出る
// 構成 (新しい構成か) と humanPaths は、宛先の先端のツリーから読む。作業ツリーのファイルも枝分かれの点の値も、
// 変更の作者が選べるので使わない。判定できないときは `ai` を返さず、検査不能 (violation: cannot-check) を返す。

import { DEFAULT_IGETA_CONFIG, parseIgetaConfig } from '../core/IgetaConfig.js';
import type { Violation } from '../core/Report.js';
import type { GitRunner } from './GitRepo.js';
import { GitError, GitRepo } from './GitRepo.js';
import { matchesGlob } from './PathGlob.js';
import { ROLE_FOLDERS } from './RoleFolders.js';

export type ApprovalVerdict = 'human' | 'ai';

/** 宛先の指定。`ci` は CI が渡した宛先のブランチの名前 (`origin/<名前>`)、`local` は手元の確認用の ref。 */
export type BaseSpec =
  | { readonly mode: 'ci'; readonly branch: string }
  | { readonly mode: 'local'; readonly ref: string };

export interface ResolvedBase {
  readonly mode: 'ci' | 'local';
  /** 宛先の名前 (CI では origin/<名前>)。出力に出す */
  readonly ref: string;
  /** 宛先の先端 (構成と humanPaths を読む。差分 (b) の起点) */
  readonly tip: string;
  /** 枝分かれの点: 宛先の先端と HEAD の merge-base (差分 (a) の起点) */
  readonly branchPoint: string;
}

export interface ScopeReason {
  readonly path: string;
  /** そのパスが人の承認を要する理由 */
  readonly rule: string;
}

export interface ScopeJudgement {
  readonly verdict: ApprovalVerdict;
  /** 人の承認が要る理由になったパス。`human` のとき 1 件以上、`ai` のとき空 */
  readonly reasons: readonly ScopeReason[];
  readonly base: ResolvedBase;
}

export type ScopeResult = { readonly judgement: ScopeJudgement } | { readonly violation: Violation };

export interface ApprovalScopeOptions {
  /** 検査対象 repo のルート (git の作業ツリーの最上位) */
  readonly root: string;
  readonly base: BaseSpec;
  /** git の呼び出し。省略時は実際の git (テストが差し替える) */
  readonly git?: GitRunner;
}

const GUARD_FILE = '保護と CI を決めるファイル';
const SETTING_FILE = '検査の設定と、使う Igeta の版';
const AI_FILE = 'AI への指示と権限';

/**
 * 人の承認が要るパス (ADR-0008 決定 1 の表)。パスがこの glob のどれかに当たれば `human`。
 * `X/**` は X そのもの (ファイル・symlink・submodule) にも当たり、AGENTS.md・CLAUDE.md は repo 直下にも下位にも当たる
 * (PathGlob.ts)。
 */
const FIXED_RULES: ReadonlyArray<{ readonly glob: string; readonly rule: string }> = [
  { glob: 'docs/person/**', rule: 'docs/person/ の文書' },
  { glob: 'docs/client/**', rule: 'docs/client/ の文書' },
  { glob: '.github/**', rule: GUARD_FILE },
  { glob: 'CODEOWNERS', rule: GUARD_FILE },
  { glob: 'docs/CODEOWNERS', rule: GUARD_FILE },
  { glob: '.igeta.json', rule: SETTING_FILE },
  { glob: '.igeta-version', rule: SETTING_FILE },
  { glob: '**/AGENTS.md', rule: AI_FILE },
  { glob: '**/CLAUDE.md', rule: AI_FILE },
  { glob: '.claude/**', rule: AI_FILE },
];

const cannotCheck = (message: string): { readonly violation: Violation } => ({
  violation: { severity: 'cannot-check', message },
});

/** 宛先と、枝分かれの点を決める。CI は宛先のブランチ名から origin/<名前> を引く。決められなければ理由の文字列を返す。 */
function resolveBase(repo: GitRepo, spec: BaseSpec): ResolvedBase | string {
  let ref: string;
  if (spec.mode === 'ci') {
    if (!repo.isValidBranchName(spec.branch)) return `CI が渡した宛先のブランチの名前が ref として正しくない: ${JSON.stringify(spec.branch)}`;
    ref = `refs/remotes/origin/${spec.branch}`;
  } else {
    ref = spec.ref;
  }
  const tip = repo.commitOf(ref);
  if (tip === null) {
    return spec.mode === 'ci'
      ? `宛先の ${ref} が無い。actions/checkout に fetch-depth: 0 を指定して、宛先のブランチの履歴を取る`
      : `--base ${spec.ref} が commit として解決できない`;
  }
  const branchPoint = repo.mergeBase(tip, 'HEAD');
  if (branchPoint === null) {
    return `${ref} と HEAD に共通の祖先が無く、枝分かれの点を決められない (浅い clone の可能性。fetch-depth: 0 で履歴を取る)`;
  }
  return { mode: spec.mode, ref: spec.mode === 'ci' ? `origin/${spec.branch}` : spec.ref, tip, branchPoint };
}

/** 宛先の先端の .igeta.json の humanPaths。ツリーに無いと分かったときだけ既定値。あるのに読めなければ検査不能。 */
function readHumanPaths(
  repo: GitRepo,
  base: ResolvedBase,
): { readonly humanPaths: readonly string[] } | { readonly violation: Violation } {
  if (repo.lsTree(base.tip, ['.igeta.json']).length === 0) return { humanPaths: DEFAULT_IGETA_CONFIG.humanPaths };
  const loaded = parseIgetaConfig(repo.showAt(base.tip, '.igeta.json'), `宛先 ${base.ref} の .igeta.json`);
  if ('violation' in loaded) return cannotCheck(`宛先の .igeta.json を使えないので判定できない: ${loaded.violation.message}`);
  return { humanPaths: loaded.config.humanPaths };
}

/**
 * パスだけで決まる規則 (固定の表と humanPaths)。当たらなければ null。humanPaths で当たったものは、その glob を添える。
 * 大文字と小文字を区別しない (PathGlob.ts): 大文字小文字を区別しないファイルシステムでは `docs/Person/` も `docs/person/` と
 * 同じ場所になるので、大文字小文字だけを変えたパスで抜けられないようにする。
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

export function judgeApprovalScope(options: ApprovalScopeOptions): ScopeResult {
  try {
    return judge(options);
  } catch (error) {
    if (error instanceof GitError) return cannotCheck(error.message);
    throw error;
  }
}

function judge(options: ApprovalScopeOptions): ScopeResult {
  const { root } = options;
  const repo = new GitRepo(root, options.git);
  if (!repo.isTopLevel()) {
    return cannotCheck(`${root} は git の作業ツリーの最上位ではない。repo 直下のパスで判定するので、最上位で実行する`);
  }
  const base = resolveBase(repo, options.base);
  if (typeof base === 'string') return cannotCheck(base);

  // 宛先が旧い構成だと `person/` が無く、どの差分も `ai` に見える。変更が `docs/ai/` を足して新しい構成に見せかけても、
  // 構成は宛先のツリーで決める。判定できないので `ai` を返さない
  if (repo.lsTree(base.tip, ROLE_FOLDERS, true).length === 0) {
    return cannotCheck(
      `宛先 ${base.ref} は旧い構成の repo (${ROLE_FOLDERS.join('・')} のどれも無い) なので、人の承認が要る変更を判定できない。` +
        'ADR-0003 の手順で移行してから実行する',
    );
  }
  const config = readHumanPaths(repo, base);
  if ('violation' in config) return config;
  const { humanPaths } = config;

  const changed = new Set<string>();
  const direct = options.base.mode === 'local' ? repo.diffWorkingTree(base.branchPoint) : repo.diff(base.branchPoint, 'HEAD');
  for (const change of [...direct, ...repo.diff(base.tip, repo.mergeTree(base.tip))]) changed.add(change.path);

  const reasons: ScopeReason[] = [];
  for (const path of changed) {
    const rule = pathRule(path, humanPaths);
    if (rule !== null) reasons.push({ path, rule });
  }
  reasons.sort(byPath);
  return { judgement: { verdict: reasons.length > 0 ? 'human' : 'ai', reasons, base } };
}

// 理由のパスに改行などが入っていても、出力の行を偽造できないようにする
const displayPath = (path: string): string => (/[\u0000-\u001f\u007f]/.test(path) ? JSON.stringify(path) : path);

/**
 * 出力。1 行目は `human` か `ai`、続けて理由になったパスを 1 行ずつ (`- <パス> (<理由>)`。humanPaths で当たったものは
 * その glob を添える)。空行のあとに、宛先と枝分かれの点、`--base` のときは手元の確認用である旨を付ける。
 */
export function formatJudgement(judgement: ScopeJudgement): readonly string[] {
  const { base } = judgement;
  const lines: string[] = [judgement.verdict];
  for (const reason of judgement.reasons) lines.push(`- ${displayPath(reason.path)} (${reason.rule})`);
  lines.push('');
  lines.push(
    `宛先: ${base.ref} (${base.tip.slice(0, 12)})・枝分かれの点: ${base.branchPoint.slice(0, 12)}${base.mode === 'ci' ? ' (--ci)' : ''}`,
  );
  if (base.mode === 'local') {
    lines.push('手元の確認用 (--base)。CI の判定は --ci が宛先のブランチ (origin/<名前>) で行う');
  }
  return lines;
}
