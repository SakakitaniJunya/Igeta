// GitHubPort の fixture (テスト仕様 12 §1)。キーは PR・Issue の番号。無い番号は「見つからない」を返す。

import { fail, succeed } from '#decision/core';
import type { GitHubPort, IssueInfo, PullInfo } from './port.js';

export interface PortFixture {
  readonly pulls?: Readonly<Record<number, PullInfo>>;
  readonly commits?: Readonly<Record<number, readonly string[]>>;
  readonly issues?: Readonly<Record<number, IssueInfo>>;
}

export function fixturePort(fixture: PortFixture): GitHubPort {
  const lookup = <T>(table: Readonly<Record<number, T>> | undefined, kind: string, number: number) => {
    const found = table?.[number];
    return found === undefined ? fail(`fixture に ${kind}/${number} が無い (見つからない)`) : succeed(found);
  };
  return {
    pull: async (_repo, number) => lookup(fixture.pulls, 'pull', number),
    pullCommits: async (_repo, number) => lookup(fixture.commits, 'pull-commits', number),
    issue: async (_repo, number) => lookup(fixture.issues, 'issue', number),
  };
}

/** gh が無い環境の口: どれも失敗 (検査不能 2) */
export const unavailablePort: GitHubPort = {
  pull: async () => fail('gh を実行できない'),
  pullCommits: async () => fail('gh を実行できない'),
  issue: async () => fail('gh を実行できない'),
};
