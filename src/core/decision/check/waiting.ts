// DS11: 承認待ち (proposed) の持ち主 (awaiting) と、待ち日数・期限の警告。日付で変わるものは違反にせず警告にする。

import type { DecisionDoc } from '../decision.js';
import type { Finding } from '../history.js';

const NO_VALUE = '—';

/** 経過日数 = to − from (日)。どちらも `YYYY-MM-DD` */
export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export interface WaitingContext {
  /** DS12 の条件の repo か。違えば awaiting の欠けは警告にとどめる */
  readonly isStrict: boolean;
  readonly approverNames: readonly string[];
  readonly staleDays: number;
  readonly today: string;
  /** 初めて現れた日。浅い clone で辿れなければ created で、そう書く */
  readonly waitingSince: { readonly date: string; readonly isFromGit: boolean };
}

/** DS11: 持ち主 (awaiting) が要る。経過日数が staleDays を超える・期限を過ぎたら警告 (当日は超過にしない) */
export function checkWaiting(doc: DecisionDoc, context: WaitingContext): { readonly findings: Finding[]; readonly warnings: string[] } {
  if (doc.status !== 'proposed') return { findings: [], warnings: [] };
  const problems: string[] = [];
  if (doc.awaiting === '') problems.push('proposed の ADR は awaiting (持ち主) が要る');
  else if (context.approverNames.length > 0 && !context.approverNames.includes(doc.awaiting)) problems.push(`awaiting "${doc.awaiting}" が approvers の名前に無い`);
  const waited = daysBetween(context.waitingSince.date, context.today);
  const source = context.waitingSince.isFromGit ? '' : ' (初めて現れた日を辿れず、created から数えた)';
  const isOverdue = doc.due !== '' && doc.due < context.today;
  const staleNote = waited > context.staleDays || isOverdue ? [`持ち主 ${doc.awaiting || NO_VALUE}・${waited} 日待ち${source}・期限 ${doc.due || NO_VALUE}`] : [];
  const findings = context.isStrict ? problems.map((message) => ({ rule: 'DS11', line: 1, message })) : [];
  const notes = [...(context.isStrict ? [] : problems), ...staleNote];
  return { findings, warnings: notes.length === 0 ? [] : [`DS11 ADR-${doc.number}: ${notes.join('・')}`] };
}

