/** 等価 filter の型と、record との照合。 */

/** 保存の項目名と、その値の組。値が undefined の項目は絞らない。 */
export type FieldFilter = Readonly<Record<string, unknown>>;

/** record が filter の定義済みの項目すべてに等しければ true。空の filter は true。 */
export function matchesFieldFilter(record: Readonly<Record<string, unknown>>, filter: FieldFilter): boolean {
  const definedEntries = Object.entries(filter).filter(([, expected]) => expected !== undefined);

  return definedEntries.every(([field, expected]) => record[field] === expected);
}
