// 入口 (App Proxy・webhook・管理 API など) ごとの Hono のルートの雛形。置き場所: backend/src/presentation/<入口>/。
// Hono を import してよいのは backend/src/presentation/ と backend/src/index.ts だけ (dependency-cruiser の hono-only-in-presentation-and-entry)。
// ここでやるのは 3 つだけ: 検証のミドルウェアを掛ける / リクエストから値を取り出す / モジュールの公開面を呼んで HttpResponse を返す。
// 業務の判断はここに書かない (コントローラとユースケースの仕事)。

import { Hono } from 'hono';
import type { __Context__Module } from '../../modules/__context__/index.js';
import { toResponse } from '../http/to-response.js';
import { verify__Entry__, type __Entry__Env, type __Entry__Verifier } from './verify-__entry__.middleware.js';

export interface __Entry__RoutesDeps {
  /** 署名・トークンの検証。platform の関数は index.ts (エントリ) が包んで渡す (platform は presentation から import できない)。 */
  readonly verify: __Entry__Verifier;
  readonly __contextVar__: __Context__Module;
}

/** index.ts で `app.route('<入口の前置き>', create__Entry__Routes(deps))` として付ける。 */
export function create__Entry__Routes(deps: __Entry__RoutesDeps): Hono<__Entry__Env> {
  const app = new Hono<__Entry__Env>();
  app.use('*', verify__Entry__(deps.verify));

  app.post('/__aggregate__s/:id/close', async (c) => toResponse(c, await deps.__contextVar__.close__Aggregate__(c.req.param('id'))));

  return app;
}
