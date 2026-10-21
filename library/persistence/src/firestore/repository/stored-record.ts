/** Firestore の文書と、Mapper が扱う record の境界。型の確定は Mapper が実行時に検証する。 */
import type { DocumentData } from '@google-cloud/firestore';
import { toStoredValues } from '#core/repository/stored-values';

/** record の項目を文書の形にする。undefined の項目は null で書く。 */
export function toDocumentData(record: object): DocumentData {
  return Object.fromEntries(Object.entries(toStoredValues(record)));
}

/**
 * 読んだ文書を record として Mapper に渡す。
 * 保存先のデータは型で保証できないため、fromRecord が実行時に検証する前提で、ここ 1 か所だけ型を確定させる。
 */
export function toStoredRecord<StoredRecord>(data: DocumentData | undefined): StoredRecord {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- 保存先の境界。Mapper.fromRecord が検証する
  return (data ?? {}) as StoredRecord;
}
