// controller。Nest を知らない素のクラス。値 (unknown) → zod で形を確かめる → usecase → HttpResponse。
// Nest の controller (entries/<入口>/) が HTTP から値を取り出してここを呼ぶ。こうしておくと、ここのテストは Nest もサーバも無しで書ける。

import { apiError, fail, ok } from '@/shared/presentation/api-response.js';
import type { HttpResponse } from '@/shared/presentation/response.js';
import type { Close__Aggregate__UseCase } from '@/modules/__context__/application/close-__aggregate__.usecase.js';
import type { Create__Aggregate__UseCase } from '@/modules/__context__/application/create-__aggregate__.usecase.js';
import type { List__Aggregate__ItemsUseCase } from '@/modules/__context__/application/list-__aggregates__.usecase.js';
import {
  close__Aggregate__ParamsSchema,
  create__Aggregate__BodySchema,
  detailsOf,
  list__Aggregate__ItemsQuerySchema,
} from '@/modules/__context__/presentation/__aggregate__.schemas.js';

export interface __Aggregate__UseCases {
  readonly list: Pick<List__Aggregate__ItemsUseCase, 'execute'>;
  readonly create: Pick<Create__Aggregate__UseCase, 'execute'>;
  readonly close: Pick<Close__Aggregate__UseCase, 'execute'>;
}

function validationFailed(details: string[]): HttpResponse {
  return apiError(400, 'VALIDATION_FAILED', 'request validation failed', details);
}

export class __Aggregate__Controller {
  constructor(private readonly useCases: __Aggregate__UseCases) {}

  async list(query: unknown): Promise<HttpResponse> {
    const parsed = list__Aggregate__ItemsQuerySchema.safeParse(query);
    if (!parsed.success) return validationFailed(detailsOf(parsed.error));
    const result = await this.useCases.list.execute({ status: parsed.data.status });
    return result.ok ? ok({ items: result.value.items, truncated: result.value.truncated }) : fail(result.error);
  }

  async create(body: unknown): Promise<HttpResponse> {
    const parsed = create__Aggregate__BodySchema.safeParse(body);
    if (!parsed.success) return validationFailed(detailsOf(parsed.error));
    const result = await this.useCases.create.execute({ name: parsed.data.name });
    return result.ok ? ok({ item: result.value }, 201) : fail(result.error);
  }

  async close(id: unknown): Promise<HttpResponse> {
    const parsed = close__Aggregate__ParamsSchema.safeParse({ id });
    if (!parsed.success) return validationFailed(detailsOf(parsed.error));
    const result = await this.useCases.close.execute({ id: parsed.data.id });
    return result.ok ? ok({ item: result.value }) : fail(result.error);
  }
}
