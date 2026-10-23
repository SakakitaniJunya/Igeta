// 履歴の行の並びが許されるかの規則 (テスト仕様 10 の DS3・DS7・DS9)。履歴の読み書きは ../history.ts。

import type { DecisionDoc } from '../decision.js';
import type { Finding, HistoryRow } from '../history.js';
import { isPreMigrationRow, serializeRow } from '../history.js';

/** 事象ごとの、前→後として許す状態。移行前は前が不明なので after だけを見る */
const EVENT_RULES: Readonly<Record<string, { readonly from: readonly string[]; readonly to: readonly string[] }>> = {
  承認: { from: ['proposed'], to: ['accepted'] },
  却下: { from: ['proposed'], to: ['rejected'] },
  改訂: { from: ['accepted', 'amended'], to: ['amended'] },
  置換: { from: ['accepted', 'amended'], to: ['superseded'] },
  差戻し: { from: ['accepted', 'rejected'], to: ['proposed'] },
  移行前: { from: [], to: ['superseded', 'deprecated'] },
};


function checkRowTransition(row: HistoryRow, previousAfter: string | undefined): Finding[] {
  const rule = EVENT_RULES[row.event];
  if (rule === undefined) return [{ rule: 'DS9', line: row.line, message: `履歴の事象 "${row.event}" は使えない (${Object.keys(EVENT_RULES).join('・')})` }];
  const findings: Finding[] = [];
  const isPreMigration = isPreMigrationRow(row);
  if (!rule.to.includes(row.after) || (!isPreMigration && !rule.from.includes(row.before))) {
    findings.push({ rule: 'DS9', line: row.line, message: `${row.before}→${row.after} は事象 "${row.event}" で許される遷移ではない` });
  }
  if (previousAfter !== undefined && !isPreMigration && row.before !== previousAfter) {
    findings.push({ rule: 'DS9', line: row.line, message: `前の状態 ${row.before} が、一つ前の行の後 ${previousAfter} と続いていない` });
  }
  if (row.event === '差戻し' && row.memo === '') findings.push({ rule: 'DS9', line: row.line, message: '差戻しの行は、メモに旧い状態と日付が要る' });
  if (row.after === 'deprecated' && !isPreMigration) findings.push({ rule: 'DS9', line: row.line, message: 'deprecated にする書き込み口は無い (移行前の行だけが持てる)' });
  return findings;
}

/** DS9: 行ごとの遷移と、行の連なり */
export function checkTransitions(rows: readonly HistoryRow[]): Finding[] {
  return rows.flatMap((row, index) => checkRowTransition(row, rows[index - 1]?.after));
}

/** DS3: status は履歴の最後の「後」と同じ。行が 0 本なら proposed。proposed 以外は 1 本以上 */
export function checkStatusMatchesHistory(status: string, rows: readonly HistoryRow[]): Finding[] {
  const last = rows.at(-1);
  if (last === undefined) {
    return status === 'proposed' ? [] : [{ rule: 'DS3', line: 1, message: `status: ${status} だが承認の履歴の行が無い (手書きの状態。decision-* で記録する)` }];
  }
  return last.after === status ? [] : [{ rule: 'DS3', line: 1, message: `status: ${status} が履歴の最後の「後」(${last.after}) と違う` }];
}

const sameRow = (a: HistoryRow, b: HistoryRow): boolean => serializeRow(a) === serializeRow(b);

/** DS7: 対象 branch の履歴に対して、1 行も消えず・変わらず・順が同じで、新しい行は末尾だけ */
export function checkAppendOnly(base: { readonly status: string; readonly rows: readonly HistoryRow[] }, current: { readonly status: string; readonly rows: readonly HistoryRow[] }): Finding[] {
  const changed = base.rows.findIndex((baseRow, index) => {
    const row = current.rows[index];
    return row === undefined || !sameRow(baseRow, row);
  });
  if (changed !== -1) {
    return [{ rule: 'DS7', line: current.rows[changed]?.line ?? 1, message: `履歴の ${changed + 1} 行目が対象 branch から変わった・消えた (履歴は追記のみ)` }];
  }
  if (base.status !== current.status && current.rows.length === base.rows.length) {
    return [{ rule: 'DS7', line: 1, message: `status が ${base.status} から ${current.status} に変わったのに、履歴の行が増えていない` }];
  }
  return [];
}

/** DS7: 対象 branch (base) にあった ADR が消えていない・履歴が追記のみ。ADR は id で突き合わせる (移動しても同じ) */
export function checkAgainstBase(baseDocs: readonly DecisionDoc[], docs: readonly DecisionDoc[]): Finding[] {
  const current = new Map(docs.map((doc) => [doc.id, doc]));
  return baseDocs.flatMap((before) => {
    const now = current.get(before.id);
    if (now === undefined) return [{ rule: 'DS7', line: 1, path: before.path, message: `${before.id}: 対象 branch にあった ADR が消えている (却下の履歴も消せない。置換は retired/ へ移す)` }];
    return checkAppendOnly(before, now).map((finding) => ({ ...finding, path: now.path }));
  });
}
