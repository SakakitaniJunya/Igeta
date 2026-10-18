// 入口の検証ミドルウェアの雛形。検証に通らなければ、配下のルートを呼ばずに 401 を返す。
// 通ったら、検証済みの値 (利用者など) を c.set で渡す。ルートは c.get で読む。
// 検証にはヘッダと URL だけを渡す。本文は渡さない (ここで読むと、ルートが本文を読めなくなる)。
// 本文の HMAC が要る入口 (webhook など) は、本文を先に一度だけ読んでから確かめる形に差し替える。

import type { MiddlewareHandler } from 'hono';
import { toResponse } from '@/entries/http/to-response.js';
import type { AppError } from '@/shared/domain/app-error.js';
import type { Result } from '@/shared/domain/result.js';
import { apiError } from '@/shared/presentation/api-response.js';

/** 検証済みの値。必要な項目だけを持つ。 */
export interface __Entry__Claims {
  readonly subject: string;
}

export type __Entry__Verifier = (request: { readonly headers: Headers; readonly url: string }) => Promise<Result<__Entry__Claims, AppError>>;

export type __Entry__Env = { Variables: { claims: __Entry__Claims } };

export function verify__Entry__(verify: __Entry__Verifier): MiddlewareHandler<__Entry__Env> {
  return async (c, next) => {
    const verified = await verify({ headers: c.req.raw.headers, url: c.req.url });
    if (!verified.ok) {
      return toResponse(c, apiError(401, 'UNAUTHORIZED', verified.error.message));
    }
    c.set('claims', verified.value);
    await next();
  };
}
