/** 保存先の id として使ってよい文字列の規則。Firestore と Postgres で同じ規則を掛ける。 */
import { invalid } from './app-error';

const MAX_DOCUMENT_ID_LENGTH = 64;
const DOCUMENT_ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{1,${MAX_DOCUMENT_ID_LENGTH}}$`);

/** id が `[A-Za-z0-9_-]` の 1〜64 字ならば true。`.`・`..`・`/` を含む値は通らない。 */
export function isDocumentId(value: string): boolean {
  return DOCUMENT_ID_PATTERN.test(value);
}

/** id が規則に合わないとき invalid を投げる。message に値を出さない。 */
export function assertDocumentId(value: string): void {
  if (isDocumentId(value)) return;

  throw invalid('id の形が不正です');
}
