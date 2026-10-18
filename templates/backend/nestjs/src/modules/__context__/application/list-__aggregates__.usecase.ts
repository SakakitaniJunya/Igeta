// usecase。一覧は上限つき。上限は定数で持ち、環境変数にしない。

import type { AppError } from '@/shared/domain/app-error.js';
import { ok, type Result } from '@/shared/domain/result.js';
import { to__Aggregate__View, type __Aggregate__View } from '@/modules/__context__/application/create-__aggregate__.usecase.js';
import type { __Aggregate__Status } from '@/modules/__context__/domain/__aggregate__.js';
import type { __Aggregate__Repository } from '@/modules/__context__/domain/ports/__aggregate__.repository.port.js';

/** 一覧で返す件数の上限。超える分は切り、truncated で知らせる。 */
export const LIST_LIMIT = 100;

export interface List__Aggregate__ItemsInput {
  /** 省くと全部。 */
  readonly status?: __Aggregate__Status | undefined;
}

export interface List__Aggregate__ItemsOutput {
  readonly items: ReadonlyArray<__Aggregate__View>;
  /** 上限で打ち切ったか。 */
  readonly truncated: boolean;
}

export class List__Aggregate__ItemsUseCase {
  constructor(private readonly repository: __Aggregate__Repository) {}

  async execute(input: List__Aggregate__ItemsInput): Promise<Result<List__Aggregate__ItemsOutput, AppError>> {
    // 1 件多く読み、上限を超えたかどうかで truncated を決める。
    const found = await this.repository.list({ status: input.status, limit: LIST_LIMIT + 1 });
    return ok({ items: found.slice(0, LIST_LIMIT).map(to__Aggregate__View), truncated: found.length > LIST_LIMIT });
  }
}
