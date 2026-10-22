// GitHub の差し込み口 (テスト仕様 12 §1)。decision-* は GitHub をこの口越しにだけ読む。本番は gh-port.ts (`gh api`)、
// テストは fixture の実装を渡す。見つからない・gh が使えないは失敗 (Result) で返し、呼び出し側が検査不能 (2) にする。

import type { Result } from '#decision/core';

export type PullState = 'open' | 'closed' | 'merged';

export interface PullInfo {
  readonly state: PullState;
  readonly author: string;
  readonly mergedBy?: string;
  readonly closedBy?: string;
  /** merge した commit。squash なら 1 本、merge commit ならその commit */
  readonly mergeCommit?: string;
  /** merge した日 (YYYY-MM-DD)。履歴の日付に使う。無ければ記録した日 */
  readonly mergedAt?: string;
  /** PR の head の repo (`owner/repo`) */
  readonly headRepo?: string;
}

export interface IssueInfo {
  readonly state: 'open' | 'closed';
  readonly closedBy?: string;
}

export interface GitHubPort {
  pull(repo: string, number: number): Promise<Result<PullInfo>>;
  /** その PR の commit の sha (古い順) */
  pullCommits(repo: string, number: number): Promise<Result<readonly string[]>>;
  issue(repo: string, number: number): Promise<Result<IssueInfo>>;
}
