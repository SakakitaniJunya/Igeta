// 置き場所・一意・覆す・再提案の規則 (テスト仕様 10 の DS1・DS2・DS8・DS10)。
// フォルダは状態で分ける: proposed/ (年なし)・accepted/<年>/・rejected/<年>/・retired/<年>/。

import { posix } from 'node:path';
import type { DecisionDoc } from './decision.js';
import type { Finding, HistoryRow } from './history.js';
import { isPreMigrationRow } from './history.js';

export const DECISIONS_DIR = 'docs/person/decisions';
export const STATE_DIRS = ['proposed', 'accepted', 'rejected', 'retired'] as const;

const FOLDER_OF_STATUS: Readonly<Record<string, (typeof STATE_DIRS)[number]>> = {
  proposed: 'proposed',
  accepted: 'accepted',
  amended: 'accepted',
  rejected: 'rejected',
  superseded: 'retired',
  deprecated: 'retired',
};

/** 年 = 最後の承認・却下 (移行前を含む) の行の日付の年。改訂・置換・差戻しの行では動かない */
export function decisionYear(rows: readonly HistoryRow[]): string {
  const decided = rows.filter((row) => row.event === '承認' || row.event === '却下' || isPreMigrationRow(row));
  return decided.at(-1)?.date.slice(0, 4) ?? '';
}

/** decisions/ からの相対で、状態から決まるフォルダ (`accepted/2026`・`proposed`)。決められなければ空 */
export function expectedDirectory(doc: Pick<DecisionDoc, 'status' | 'rows'>): string {
  const folder = FOLDER_OF_STATUS[doc.status];
  if (folder === undefined) return '';
  if (folder === 'proposed') return folder;
  const year = decisionYear(doc.rows);
  return year === '' ? '' : `${folder}/${year}`;
}

const decisionsRelative = (path: string): string => posix.relative(DECISIONS_DIR, posix.dirname(path));

/** DS1: 置き場所 */
export function checkPlacement(doc: DecisionDoc): Finding[] {
  const expected = expectedDirectory(doc);
  const actual = decisionsRelative(doc.path);
  if (expected === '') return [{ rule: 'DS1', line: 1, message: `status: ${doc.status} の置き場所を決められない (状態の語か、承認・却下の行の日付が読めない)` }];
  return actual === expected ? [] : [{ rule: 'DS1', line: 1, message: `置き場所が違う: ${actual}/ にあるが、status: ${doc.status} は ${expected}/` }];
}

function duplicates(docs: readonly DecisionDoc[], key: (doc: DecisionDoc) => string, label: string): Finding[] {
  const byKey = new Map<string, DecisionDoc[]>();
  for (const doc of docs) byKey.set(key(doc), [...(byKey.get(key(doc)) ?? []), doc]);
  return [...byKey.entries()]
    .filter(([, group]) => group.length > 1)
    .flatMap(([value, group]) =>
      group.map((doc) => ({ rule: 'DS2', line: 1, path: doc.path, message: `${label} ${value} が ${group.length} 本ある: ${group.map((d) => d.path).join(' / ')}` })),
    );
}

/** DS2: 同じ id か同じ番号が、フォルダをまたいで 2 本以上ある */
export const checkUnique = (docs: readonly DecisionDoc[]): Finding[] => [...duplicates(docs, (doc) => doc.id, 'id'), ...duplicates(docs, (doc) => doc.number, '番号')];

const isInForce = (status: string): boolean => status === 'accepted' || status === 'amended';

function pairProblem(doc: DecisionDoc, byId: ReadonlyMap<string, DecisionDoc>): string[] {
  const problems: string[] = [];
  for (const oldId of doc.supersedes) {
    const old = byId.get(oldId);
    if (old === undefined || old.supersededBy !== doc.id) problems.push(`supersedes: ${oldId} の側に superseded_by: ${doc.id} が無い (片側だけ)`);
    else if (isInForce(doc.status) && old.status === 'accepted') problems.push(`${oldId} が accepted のまま (decision-supersede で retired へ)`);
  }
  if (doc.supersededBy !== '') {
    const next = byId.get(doc.supersededBy);
    if (next === undefined || !next.supersedes.includes(doc.id)) problems.push(`superseded_by: ${doc.supersededBy} の側に supersedes: ${doc.id} が無い (片側だけ)`);
    else if (doc.status === 'superseded' && next.status === 'proposed') problems.push(`${doc.supersededBy} がまだ proposed なのに retired になっている`);
  }
  return problems;
}

/** DS8: supersedes と superseded_by は対。承認済の新と accepted の旧・retired の旧と proposed の新・循環・片側だけは違反 */
export function checkSupersession(docs: readonly DecisionDoc[]): Finding[] {
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  return docs.flatMap((doc) => {
    const cycle = new Set<string>();
    for (let next = byId.get(doc.supersededBy); next !== undefined && !cycle.has(next.id); next = byId.get(next.supersededBy)) cycle.add(next.id);
    const looped = cycle.has(doc.id) ? ['置換が循環している'] : [];
    return [...pairProblem(doc, byId), ...looped].map((message) => ({ rule: 'DS8', line: 1, path: doc.path, message: `${doc.id}: ${message}` }));
  });
}

/** DS10: reopens は rejected の ADR だけを指す */
export function checkReopens(docs: readonly DecisionDoc[]): Finding[] {
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  return docs
    .filter((doc) => doc.reopens !== '' && byId.get(doc.reopens)?.status !== 'rejected')
    .map((doc) => ({ rule: 'DS10', line: 1, path: doc.path, message: `reopens: ${doc.reopens} は rejected の ADR ではない (再提案は却下された ADR だけを指す)` }));
}
