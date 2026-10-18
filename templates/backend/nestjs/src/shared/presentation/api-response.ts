// API の応答の形はここだけが作る。成功は {ok:true,...}、失敗は {ok:false,error:{code,message,details?}}。
// usecase は Result を返し、controller が ok / apiError / fail のどれかで HttpResponse にする。

import type { AppError, AppErrorKind } from '@/shared/domain/app-error.js';
import type { HttpResponse } from '@/shared/presentation/response.js';

/** 成功。payload の項目を {ok:true} に並べる (例: ok({ item }, 201))。 */
export function ok(payload: Readonly<Record<string, unknown>>, status = 200): HttpResponse {
  return { status, body: { ok: true, ...payload } };
}

/** 失敗の本文。details は項目名の配列など、利用者に見せてよい補足だけを渡す。 */
export function apiError(status: number, code: string, message: string, details?: unknown): HttpResponse {
  const error = details === undefined ? { code, message } : { code, message, details };
  return { status, body: { ok: false, error } };
}

const assertNever = (value: never): never => {
  throw new Error(`未対応の AppErrorKind: ${String(value)}`);
};

/** AppError → 応答。kind を増やしたらここが型で落ちる。 */
export function fail(error: AppError): HttpResponse {
  const kind: AppErrorKind = error.kind;
  switch (kind) {
    case 'unauthorized':
      return apiError(401, 'UNAUTHORIZED', error.message, error.detail);
    case 'invalid':
      return apiError(400, 'INVALID_REQUEST', error.message, error.detail);
    case 'not_found':
      return apiError(404, 'NOT_FOUND', error.message, error.detail);
    case 'conflict':
      return apiError(409, 'CONFLICT', error.message, error.detail);
    case 'unprocessable':
      return apiError(422, 'UNPROCESSABLE', error.message, error.detail);
    case 'unavailable':
      return apiError(503, 'UNAVAILABLE', error.message, error.detail);
    default:
      return assertNever(kind);
  }
}
