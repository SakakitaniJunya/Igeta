// コントローラの雛形。HTTP フレームワーク (Hono) を知らない関数にする。入力は unknown、出力は HttpResponse。
// 入口 (src/entries/<入口>/*.routes.ts) がリクエストから値を取り出して module の公開面 (index.ts) 経由でここを呼ぶ。
// 流れは「schema で safeParse → 落ちたら 400 VALIDATION_FAILED + details → 通ったら usecase → ok / fail(error)」。
// usecase は Result を返し、HttpResponse を組むのはここ。

import type { z } from 'zod';
import type { Close__Aggregate__UseCase } from '@/modules/__context__/application/close-__aggregate__.usecase.js';
import type { Create__Aggregate__UseCase } from '@/modules/__context__/application/create-__aggregate__.usecase.js';
import type { List__Aggregate__ItemsUseCase } from '@/modules/__context__/application/list-__aggregates__.usecase.js';
import { apiError, fail, ok } from '@/shared/presentation/api-response.js';
import type { HttpResponse } from '@/shared/presentation/response.js';
import {
  close__Aggregate__ParamsSchema,
  create__Aggregate__BodySchema,
  detailsOf,
  list__Aggregate__ItemsQuerySchema,
} from './__aggregate__.schemas.js';

function validationFailed(error: z.ZodError): HttpResponse {
  return apiError(400, 'VALIDATION_FAILED', 'request validation failed', detailsOf(error));
}

export async function handleList__Aggregate__Items(useCase: List__Aggregate__ItemsUseCase, query: unknown): Promise<HttpResponse> {
  const parsed = list__Aggregate__ItemsQuerySchema.safeParse(query);
  if (!parsed.success) return validationFailed(parsed.error);
  const result = await useCase.execute(parsed.data);
  return result.ok ? ok({ items: result.value.items, truncated: result.value.truncated }) : fail(result.error);
}

export async function handleCreate__Aggregate__(useCase: Create__Aggregate__UseCase, body: unknown): Promise<HttpResponse> {
  const parsed = create__Aggregate__BodySchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);
  const result = await useCase.execute(parsed.data);
  return result.ok ? ok({ item: result.value }, 201) : fail(result.error);
}

export async function handleClose__Aggregate__(useCase: Close__Aggregate__UseCase, id: unknown): Promise<HttpResponse> {
  const parsed = close__Aggregate__ParamsSchema.safeParse({ id });
  if (!parsed.success) return validationFailed(parsed.error);
  const result = await useCase.execute(parsed.data);
  return result.ok ? ok({ item: result.value }) : fail(result.error);
}
