/** 保存する値の決まり。Mapper の record で undefined の項目は、どの実装でも null として保存する。 */

/**
 * record の undefined の項目を null にして返す。Firestore は undefined を書けず、Postgres は書かない項目を上書きしないため、
 * 「値を消して保存」を 3 実装で同じにする。読み出しでは、消した項目が null で Mapper に渡る。
 */
export function toStoredValues<StoredRecord extends object>(record: StoredRecord): StoredRecord {
  const entries = Object.entries(record).map(([field, value]) => [field, value === undefined ? null : value]);

  // 型の上では undefined を許す項目も、実行時は null になる。Mapper の record の型は null を含めて書く前提
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- null への置き換えは型で表せない
  return Object.fromEntries(entries) as StoredRecord;
}
