// record.*.test.ts が共有する道具: 一時 repo に proposed の ADR を置き、fixture の PR で記録を呼ぶ。
import { DecisionStatusCheck } from '#checks/DecisionStatusCheck.js';
import { APPROVER, DECISIONS, makeRepo } from '#core/decision/decision.test-support.js';
import { DECISIONS_README, adrText, pullUrl } from '#core/decision/adr.test-support.js';
import type { TestRepo } from '#core/decision/decision.test-support.js';
import { IGETA_ROOT } from '#core/Paths.js';
import { fixturePort } from './port.test-support.js';
import type { GitHubPort, PullInfo } from './port.js';
import type { DecisionVerb, RecordRequest } from './plan.js';

export const OTHER = { name: '別の承認者', github: 'other-gh' };

export function newRepo(): TestRepo {
  const repo = makeRepo();
  repo.write(`${DECISIONS}/README.md`, DECISIONS_README);
  return repo;
}

/** proposed の ADR を commit する (この commit が PR の merge commit)。fixture の PR #7 は approver が merge 済み */
export function seedProposed(repo: TestRepo, number = '0003', slug = 'cache'): { sha: string; port: GitHubPort; path: string } {
  const path = `${DECISIONS}/proposed/${number}-${slug}.md`;
  repo.write(path, adrText({ number, slug, extra: { awaiting: APPROVER.name } }));
  const sha = repo.commit(`ADR-${number} を提案 (#7)`);
  return { sha, port: mergedPort(sha), path };
}

export const mergedPort = (sha: string, patch: Partial<PullInfo> = {}): GitHubPort =>
  fixturePort({ pulls: { 7: { state: 'merged', author: 'ai', mergedBy: APPROVER.github, mergeCommit: sha, mergedAt: '2026-10-05', ...patch } }, commits: { 7: [sha] } });

export function request(repo: TestRepo, port: GitHubPort, patch: Partial<RecordRequest> = {}): RecordRequest {
  return {
    root: repo.root,
    igetaRoot: IGETA_ROOT,
    verb: 'accept' as DecisionVerb,
    target: '0003',
    by: APPROVER.name,
    evidence: pullUrl(7),
    isDryRun: false,
    port,
    today: '2026-10-22',
    ...patch,
  };
}

export const status = (repo: TestRepo): string => repo.git('status', '--porcelain');

export function checkClean(repo: TestRepo): string[] {
  const check = new DecisionStatusCheck({ now: () => new Date('2026-10-22T00:00:00Z') });
  return check.run({ targetRoot: repo.root, igetaRoot: IGETA_ROOT }).map((v) => `${v.file ?? ''} ${v.message}`);
}
