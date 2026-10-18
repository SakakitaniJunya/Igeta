// ユースケースの雛形 (一覧)。上限つき: 上限を超える分は返さず、超えたことを truncated で伝える (原則: 黙って切り捨てない)。

import type { __Aggregate__Status } from '@/modules/__context__/domain/__aggregate__.js';
import type { __Aggregate__Repository } from '@/modules/__context__/domain/ports/__aggregate__.repository.port.js';
import { to__Aggregate__View, type __Aggregate__View } from '@/modules/__context__/application/create-__aggregate__.usecase.js';
import type { AppError } from '@/shared/domain/app-error.js';
import { ok, type Result } from '@/shared/domain/result.js';

/** 一覧で返す件数の上限。環境変数にはしない (変えるときはコードと一緒に変える)。 */
export const LIST_LIMIT = 100;

export interface List__Aggregate__ItemsInput {
  /** 省くと全部の状態。 */
  readonly status?: __Aggregate__Status | undefined;
}

export interface List__Aggregate__ItemsOutput {
  readonly items: ReadonlyArray<__Aggregate__View>;
  /** 上限を超える分が残っているとき true。 */
  readonly truncated: boolean;
}

export class List__Aggregate__ItemsUseCase {
  constructor(
    private readonly repository: __Aggregate__Repository,
    /** 1 以上の整数。組み立て (index.ts) が LIST_LIMIT を渡す。 */
    private readonly limit: number,
  ) {}

  async execute(input: List__Aggregate__ItemsInput): Promise<Result<List__Aggregate__ItemsOutput, AppError>> {
    // 1 件多く読み、上限を超えたかどうかだけを見る。
    const rows = await this.repository.list(input.status, this.limit + 1);
    return ok({ items: rows.slice(0, this.limit).map(to__Aggregate__View), truncated: rows.length > this.limit });
  }
}
