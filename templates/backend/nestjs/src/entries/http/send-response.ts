// module の公開面が返す HttpResponse (フレームワークを知らない形) を、express の応答にする。
// 本文が undefined なら空 (204 など)。それ以外は JSON。

import type { Response } from 'express';
import type { HttpResponse } from '@/shared/presentation/response.js';

export function sendResponse(res: Response, response: HttpResponse): void {
  res.status(response.status);
  if (response.headers !== undefined) res.set(response.headers);
  if (response.body === undefined) {
    res.end();
    return;
  }
  res.type('application/json').send(JSON.stringify(response.body));
}
