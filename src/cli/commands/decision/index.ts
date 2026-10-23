// 決定の状態を変える・洗い出すコマンドの公開口 (`#decision/cli`)。登録は checkCommands.ts が 1 行で行う。

import type { Command } from '#cli/Command.js';
import { createGhPort } from './gh-port.js';
import type { GitHubPort } from './port.js';
import { DecisionPendingCommand } from './pending.js';
import { DecisionAcceptCommand, DecisionAmendCommand, DecisionRejectCommand, DecisionSupersedeCommand } from './verbs.js';

export type { GitHubPort } from './port.js';
export { commitChanges, recordDecision } from './record.js';
export type { CommitRequest } from './record.js';
export { build, planAccept, prepare, proceed, refuse, row, yearOf } from './plan.js';
export type { Change, Context, RecordOutcome, RecordRequest, Step } from './plan.js';
export { createGhPort } from './gh-port.js';
export { collectPending } from './pending.js';

/** decision-* の 5 コマンド。port を渡さなければ `gh api` で読む本番の実装 */
export function createDecisionCommands(port: () => GitHubPort = createGhPort): readonly Command[] {
  return [new DecisionAcceptCommand(port), new DecisionRejectCommand(port), new DecisionSupersedeCommand(port), new DecisionAmendCommand(port), new DecisionPendingCommand()];
}
