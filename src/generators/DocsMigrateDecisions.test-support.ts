// DocsMigrateDecisions.*.test.ts が共有する道具: 旧配置の ADR を一時 repo に置き、決定の段を fixture の GitHubPort で呼ぶ。
import type { GitHubPort } from '#cli/commands/decision/port.js';
import { DecisionStatusCheck } from '#checks/DecisionStatusCheck.js';
import { DECISIONS, makeRepo } from '#core/decision/decision.test-support.js';
import { DECISIONS_README, adrText } from '#core/decision/adr.test-support.js';
import type { TestRepo } from '#core/decision/decision.test-support.js';
import { IGETA_ROOT } from '#core/Paths.js';
import { migrateDecisions } from './DocsMigrateDecisions.js';
import type { EvidenceRow } from './DocsMigrateDecisions.js';

export const TODAY = '2026-10-22';
export const legacyPath = (number: string, slug: string): string => `${DECISIONS}/2026/${number}-${slug}.md`;

/** ADR を旧配置 (<年>/) に置く。frontmatter の accepted は 2026-10-03 */
export function legacyAdr(repo: TestRepo, number: string, slug: string, status: string): void {
  repo.write(legacyPath(number, slug), adrText({ number, slug, status, extra: { accepted: '2026-10-03' } }));
}

export function legacyRepo(): TestRepo {
  const repo = makeRepo();
  repo.write(`${DECISIONS}/README.md`, DECISIONS_README);
  return repo;
}

export function run(repo: TestRepo, port: GitHubPort, evidenceRows: readonly EvidenceRow[] = [], isDryRun = false): ReturnType<typeof migrateDecisions> {
  return migrateDecisions({ root: repo.root, igetaRoot: IGETA_ROOT, evidenceRows, port, today: TODAY, isDryRun });
}

export function checkOf(repo: TestRepo, base?: string): DecisionStatusCheck & { messages(): string[] } {
  const check = new DecisionStatusCheck({ base, now: () => new Date(`${TODAY}T00:00:00Z`) });
  return Object.assign(check, { messages: () => check.run({ targetRoot: repo.root, igetaRoot: IGETA_ROOT }).map((v) => `${v.file ?? ''} ${v.message}`) });
}

