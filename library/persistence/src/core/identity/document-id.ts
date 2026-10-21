/** 保存先の id として使ってよい文字列の規則。Firestore と Postgres で同じ規則を掛ける。 */
import { invalid } from '#core/result/app-error';

const MAX_DOCUMENT_ID_LENGTH = 64;
const DOCUMENT_ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{1,${MAX_DOCUMENT_ID_LENGTH}}$`);
// Firestore が予約する `__x__` の形。Postgres にも同じ規則を掛ける
const RESERVED_ID_PATTERN = /^__.*__$/;

/** id が `[A-Za-z0-9_-]` の 1〜64 字で、`__` で始まり `__` で終わる形でなければ true。`.`・`..`・`/` を含む値は通らない。 */
export function isDocumentId(value: string): boolean {
  return DOCUMENT_ID_PATTERN.test(value) && !RESERVED_ID_PATTERN.test(value);
}

/** id が規則に合わないとき invalid を投げる。message に値を出さない。 */
export function assertDocumentId(value: string): void {
  if (isDocumentId(value)) return;

  throw invalid('id の形が不正です');
}
