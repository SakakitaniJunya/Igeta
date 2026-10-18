// API 応答の形の唯一の作り手。成功と失敗の本文はここだけが作る。
//   成功: { ok: true, ...データ }
//   失敗: { ok: false, error: { code, message, details? } }
// フレームワーク依存を持たない (プレーンオブジェクト)。module の controller もここだけを通す。

import type { AppError, AppErrorKind } from '@/shared/domain/app-error.js';
import type { HttpResponse } from '@/shared/presentation/response.js';

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  /** 付随値。形の検証の失敗では落ちた項目名の配列。 */
  readonly details?: unknown;
}

/** 成功。データは平らに載せる。 */
export function ok<T extends object>(data: T, status = 200): HttpResponse {
  return { status, body: { ok: true, ...data } };
}

/** 失敗。details が無ければキー自体を出さない。 */
export function apiError(status: number, code: string, message: string, details?: unknown): HttpResponse {
  const error: ApiErrorBody = details === undefined ? { code, message } : { code, message, details };
  return { status, body: { ok: false, error } };
}

const RESPONSE_BY_KIND: Readonly<Record<AppErrorKind, { readonly status: number; readonly code: string }>> = {
  invalid: { status: 400, code: 'INVALID_REQUEST' },
  unauthorized: { status: 401, code: 'UNAUTHORIZED' },
  not_found: { status: 404, code: 'NOT_FOUND' },
  conflict: { status: 409, code: 'CONFLICT' },
  unprocessable: { status: 422, code: 'UNPROCESSABLE' },
  unavailable: { status: 503, code: 'UNAVAILABLE' },
};

/** AppError → 応答。kind の表は Record<AppErrorKind, …> なので、kind を足して表を直し忘れると型で落ちる。 */
export function fail(error: AppError): HttpResponse {
  const { status, code } = RESPONSE_BY_KIND[error.kind];
  return apiError(status, code, error.message, error.detail);
}
