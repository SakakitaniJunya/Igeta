// usecase。application は domain と shared/domain だけに依存する。HTTP も Firestore も Nest も知らない。
// 失敗は投げずに Result で返し、HTTP の状態への変換は module の presentation が行う。

import { invalid, type AppError } from '@/shared/domain/app-error.js';
import { err, ok, type Result } from '@/shared/domain/result.js';
import type { TransactionRunner } from '@/shared/domain/transaction-runner.js';
import { __Aggregate__, type __Aggregate__Status } from '@/modules/__context__/domain/__aggregate__.js';
import type { __Aggregate__Repository } from '@/modules/__context__/domain/ports/__aggregate__.repository.port.js';
import { __Aggregate__Name } from '@/modules/__context__/domain/value-objects/__aggregate__-name.js';

/** 外へ返す集約の姿。list・create・close の 3 つの usecase が同じ形で返す。 */
export interface __Aggregate__View {
  readonly id: string;
  readonly name: string;
  readonly status: __Aggregate__Status;
}

export function to__Aggregate__View(entity: __Aggregate__): __Aggregate__View {
  return { id: entity.id, name: entity.name.value, status: entity.status };
}

export interface Create__Aggregate__Input {
  readonly name: string;
}

/** 名前から値オブジェクトを作り、開いた状態で保存する。名前の意味の誤り (空・長すぎ) は invalid。 */
export class Create__Aggregate__UseCase {
  constructor(
    private readonly repository: __Aggregate__Repository,
    private readonly transactionRunner: TransactionRunner,
    /** id の生成。乱数は組み立て側 (module の index.ts) が渡す。 */
    private readonly newId: () => string,
  ) {}

  async execute(input: Create__Aggregate__Input): Promise<Result<__Aggregate__View, AppError>> {
    let name: __Aggregate__Name;
    try {
      name = __Aggregate__Name.create(input.name);
    } catch (error) {
      if (error instanceof RangeError) return err(invalid(error.message));
      throw error;
    }
    const entity = new __Aggregate__({ id: this.newId(), name, status: 'open' });
    await this.transactionRunner.run((scope) => this.repository.save(entity, scope));
    return ok(to__Aggregate__View(entity));
  }
}
