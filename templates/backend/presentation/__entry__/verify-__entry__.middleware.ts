// 入口の検証ミドルウェアの雛形。検証に通らなければ、配下のルートを呼ばずに 401 を返す。
// 通ったら、検証済みの値 (店・利用者など) を c.set で渡す。ルートは c.get で読む。
// 検証にはヘッダと URL だけを渡す。本文は渡さない (ここで読むと、ルートが本文を読めなくなる)。
// 本文の HMAC が要る入口 (webhook など) は、本文を先に一度だけ読んでから確かめる (presentation/proxy・webhook を参照)。

import type { MiddlewareHandler } from 'hono';
import type { AppError } from '../../shared/kernel/app-error.js';
import type { Result } from '../../shared/kernel/result.js';

/** 検証済みの値。必要な項目だけを持つ。 */
export interface __Entry__Claims {
  readonly shop: string;
}

export type __Entry__Verifier = (request: { readonly headers: Headers; readonly url: string }) => Promise<Result<__Entry__Claims, AppError>>;

export type __Entry__Env = { Variables: { claims: __Entry__Claims } };

export function verify__Entry__(verify: __Entry__Verifier): MiddlewareHandler<__Entry__Env> {
  return async (c, next) => {
    const verified = await verify({ headers: c.req.raw.headers, url: c.req.url });
    if (!verified.ok) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: verified.error.message } }, 401);
    }
    c.set('claims', verified.value);
    await next();
  };
}
