// モジュールの公開面が返す HttpResponse (フレームワークを知らない形) を、Hono の応答にする。
// 本文が undefined なら空 (204 など)。それ以外は JSON。

import type { Context } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';
import type { HttpResponse } from '../../shared/http/response.js';

export function toResponse(c: Context, response: HttpResponse): Response {
  const headers = { 'content-type': 'application/json', ...response.headers };
  const status = response.status as StatusCode;
  if (response.body === undefined) return c.newResponse(null, status, headers);
  return c.newResponse(JSON.stringify(response.body), status, headers);
}
