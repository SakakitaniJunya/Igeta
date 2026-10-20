/** 成功か失敗かを値で返す型と、その生成関数。 */
import type { AppError } from './app-error';

/** 成功 (`ok: true`) か失敗 (`ok: false`) の和集合。 */
export type Result<T, E extends AppError = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** 成功を作る。 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** 失敗を作る。 */
export function err<E extends AppError>(error: E): Result<never, E> {
  return { ok: false, error };
}
