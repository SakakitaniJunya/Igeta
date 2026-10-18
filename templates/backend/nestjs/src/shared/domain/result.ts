// 失敗を投げずに値で返すための型。usecase はこれを返し、HTTP の状態への変換は presentation が行う。

import type { AppError } from '@/shared/domain/app-error.js';

export type Result<T, E extends AppError = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E extends AppError>(error: E): Result<never, E> => ({
  ok: false,
  error,
});
