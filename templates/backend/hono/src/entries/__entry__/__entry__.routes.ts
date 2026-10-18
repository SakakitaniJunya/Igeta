// 入口 (管理 API・proxy・webhook など) ごとの Hono のルートの雛形。置き場所: backend/src/entries/<入口>/。
// Hono を import してよいのは backend/src/entries/ と backend/src/index.ts だけ (dependency-cruiser の hono-only-in-entries)。
// ここでやるのは 3 つだけ: 検証のミドルウェアを掛ける / リクエストから値を取り出す / module の公開面を呼んで応答にする。
// 取り出した本文と id は検証せず unknown のまま渡す (形の検証は module の presentation、意味の検証は domain)。
// ここが見るのは本文の上限 (413) と JSON の構文 (400) まで。

import { Hono, type Context } from 'hono';
import { INVALID_JSON, parseJsonBody, readBody } from '@/entries/http/read-body.js';
import { toResponse } from '@/entries/http/to-response.js';
import type { __Context__Module } from '@/modules/__context__/index.js';
import { apiError } from '@/shared/presentation/api-response.js';
import { verify__Entry__, type __Entry__Env, type __Entry__Verifier } from './verify-__entry__.middleware.js';

/** 本文の上限 (バイト)。これを超えたら読むのをやめて 413。 */
export const BODY_LIMIT_BYTES = 16 * 1024;

export interface __Entry__RoutesDeps {
  /** 署名・トークンの検証。実体は利用 repo の src/index.ts が作って渡す。 */
  readonly verify: __Entry__Verifier;
  readonly __contextVar__: __Context__Module;
}

type Parsed = { readonly ok: true; readonly body: unknown } | { readonly ok: false; readonly response: Response };

/** 本文を上限つきで読み、JSON の構文だけ見て unknown で返す。空の本文は undefined。 */
async function readJson(c: Context<__Entry__Env>): Promise<Parsed> {
  const raw = await readBody(c.req.raw, BODY_LIMIT_BYTES);
  if (raw === undefined) return { ok: false, response: toResponse(c, apiError(413, 'PAYLOAD_TOO_LARGE', 'request body is too large')) };
  const body = parseJsonBody(raw);
  if (body === INVALID_JSON) return { ok: false, response: toResponse(c, apiError(400, 'INVALID_JSON', 'request body is not valid JSON')) };
  return { ok: true, body };
}

/** index.ts で `app.route('<入口の前置き>', create__Entry__Routes(deps))` として付ける。 */
export function create__Entry__Routes(deps: __Entry__RoutesDeps): Hono<__Entry__Env> {
  const app = new Hono<__Entry__Env>();
  app.use('*', verify__Entry__(deps.verify));

  app.get('/__aggregates__', async (c) => toResponse(c, await deps.__contextVar__.list__Aggregate__Items(c.req.query())));

  app.post('/__aggregates__', async (c) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return parsed.response;
    return toResponse(c, await deps.__contextVar__.create__Aggregate__(parsed.body));
  });

  app.post('/__aggregates__/:id/close', async (c) => toResponse(c, await deps.__contextVar__.close__Aggregate__(c.req.param('id'))));

  return app;
}
