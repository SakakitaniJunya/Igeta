// 管理 API の失敗 (ApiError。型は api.ts) の読み取り。型と純関数だけ。

import type { ApiError } from '@/shared/domain/api';

/** VALIDATION_FAILED の details (項目名の配列)。文字だけを取り、配列でなければ空。 */
export function validationFields(error: ApiError | null): ReadonlyArray<string> {
  return Array.isArray(error?.details) ? error.details.filter((d): d is string => typeof d === 'string') : [];
}
