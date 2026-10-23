// DecisionStatusCheck.*.test.ts が共有する道具: 検査の実行と、規則 ID の有無。
import { IGETA_ROOT } from '../core/Paths.js';
import { APPROVER, DECISIONS } from '#core/decision/decision.test-support.js';
import { adrText } from '#core/decision/adr.test-support.js';
import type { TestRepo } from '#core/decision/decision.test-support.js';
import { DecisionStatusCheck } from './DecisionStatusCheck.js';

export const NOW = (): Date => new Date('2026-10-22T00:00:00Z');

export function run(repo: TestRepo, base?: string): { messages: string[]; severities: string[]; warnings: readonly string[] } {
  const check = new DecisionStatusCheck({ now: NOW, base });
  const violations = check.run({ targetRoot: repo.root, igetaRoot: IGETA_ROOT });
  return { messages: violations.map((v) => `${v.file ?? ''}:${v.line ?? 0} ${v.message}`), severities: violations.map((v) => v.severity), warnings: check.warnings };
}

export const hasRule = (messages: readonly string[], rule: string): boolean => messages.some((m) => m.includes(`[${rule}]`));

export function proposed(repo: TestRepo, number: string, slug: string, extra: Record<string, string> = { awaiting: APPROVER.name }): void {
  repo.write(`${DECISIONS}/proposed/${number}-${slug}.md`, adrText({ number, slug, extra }));
}

