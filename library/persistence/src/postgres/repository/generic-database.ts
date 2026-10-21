/**
 * 型付きの Kysely<DB> と、table 名を文字列で受ける内部の Kysely<GenericDatabase> の境界。
 * Kysely は DB の型について不変なので、この 2 か所だけは型を確定させる (実装タスク 02 の T004 で型検査して確かめた形)。
 */
import type { Kysely } from 'kysely';

/** 内部で扱う行。id 以外の列は Mapper が決める。 */
export interface GenericRow {
  readonly id: string;
}

/** 内部で扱う DB。どの table も GenericRow を持つ。 */
export type GenericDatabase = Record<string, GenericRow>;

/** 利用者の Kysely<DB> を内部の型にする。table 名と Mapper の型は、公開側の型 (keyof DB) で検査済み。 */
export function toGenericDatabase<DB>(db: Kysely<DB>): Kysely<GenericDatabase> {
  // Kysely<DB> は GenericDatabase に代入できない。table 名は公開側の型 (keyof DB) で検査済み
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- 境界の型確定 (1 か所目)
  return db as unknown as Kysely<GenericDatabase>;
}

/** 読んだ行から id を除いて record にする。値の型は Mapper.fromRecord が実行時に検証する。 */
export function toStoredRecord<StoredRecord>(row: GenericRow): StoredRecord {
  const columns = Object.entries(row).filter(([column]) => column !== 'id');

  // 保存先のデータは型で保証できない。Mapper.fromRecord が実行時に検証する
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- 境界の型確定 (2 か所目)
  return Object.fromEntries(columns) as StoredRecord;
}
