// コントローラの雛形。HTTP フレームワーク (Hono) を知らない関数にする。入力はただの値、出力は HttpResponse。
// Hono のルート (src/presentation/<入口>/*.routes.ts) がリクエストから値を取り出し、ここを呼ぶ。
// こうしておくと、ここのテストは Hono もサーバも無しで書ける。

import { errorResponse, type HttpResponse } from '../../../shared/http/response.js';
import type { Close__Aggregate__UseCase } from '../application/close-__aggregate__.usecase.js';

/** AppError.kind → HTTP の状態。API 仕様 (docs/ai/specs/<まとまり>/api/) の表と同じにする。 */
const STATUS_BY_KIND: Readonly<Record<string, number>> = { invalid: 400, not_found: 404, conflict: 409, unprocessable: 422 };

export async function handleClose__Aggregate__(useCase: Close__Aggregate__UseCase, id: string): Promise<HttpResponse> {
  const result = await useCase.execute({ id });
  if (!result.ok) {
    return errorResponse(STATUS_BY_KIND[result.error.kind] ?? 400, 'INVALID_REQUEST', result.error.message);
  }
  return { status: 200, body: { id: result.value.id, status: result.value.status } };
}
