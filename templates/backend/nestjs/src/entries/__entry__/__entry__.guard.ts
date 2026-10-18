// 入口の認証 Guard。トークン・署名の検証は VERIFIER で注入された関数に任せ、通らなければ配下の経路を呼ばずに 401 を返す。
// 通ったら、検証済みの値 (claims) を request に載せる。
// 検証にはヘッダと URL だけを渡す。本文は読まない (ここで読むと、あとの経路が本文を読めなくなる)。
// 本文の HMAC が要る入口 (webhook など) は、この Guard を差し替え、生の本文を一度だけ読んでから確かめる。

import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AppError } from '@/shared/domain/app-error.js';
import type { Result } from '@/shared/domain/result.js';
import { apiError } from '@/shared/presentation/api-response.js';
import { ApiResponseException } from '@/entries/http/all-exceptions.filter.js';

/** 検証済みの値。必要な項目だけを持つ。 */
export interface __Entry__Claims {
  readonly shop: string;
}

export type __Entry__Verifier = (request: {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly url: string;
}) => Promise<Result<__Entry__Claims, AppError>>;

/** 検証関数を差し込むトークン。provider は利用 repo の app.module.ts が __Entry__EntryModule.register で渡す。 */
export const VERIFIER = Symbol('VERIFIER');

/** 検証済みの claims を載せた request。 */
export type __Entry__Request = Request & { claims?: __Entry__Claims };

@Injectable()
export class __Entry__Guard implements CanActivate {
  constructor(@Inject(VERIFIER) private readonly verify: __Entry__Verifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<__Entry__Request>();
    const verified = await this.verify({
      headers: request.headers,
      url: `${request.protocol}://${request.get('host') ?? ''}${request.originalUrl}`,
    });
    if (!verified.ok) {
      throw new ApiResponseException(apiError(401, 'UNAUTHORIZED', verified.error.message));
    }
    request.claims = verified.value;
    return true;
  }
}
