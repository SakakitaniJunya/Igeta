// usecase。1 usecase = 1 トランザクション。読みと書きは同じトランザクションの中で行う。

import { invalid, notFound, type AppError } from '@/shared/domain/app-error.js';
import { isValidDocIdSegment } from '@/shared/domain/doc-id.js';
import { err, ok, type Result } from '@/shared/domain/result.js';
import type { TransactionRunner } from '@/shared/domain/transaction-runner.js';
import { to__Aggregate__View, type __Aggregate__View } from '@/modules/__context__/application/create-__aggregate__.usecase.js';
import { __Aggregate__AlreadyClosedError } from '@/modules/__context__/domain/errors/__aggregate__-already-closed.error.js';
import type { __Aggregate__Repository } from '@/modules/__context__/domain/ports/__aggregate__.repository.port.js';

export interface Close__Aggregate__Input {
  readonly id: string;
}

/** 開いている集約を閉じる。無ければ not_found、閉じ済みなら conflict。 */
export class Close__Aggregate__UseCase {
  constructor(
    private readonly repository: __Aggregate__Repository,
    private readonly transactionRunner: TransactionRunner,
  ) {}

  async execute(input: Close__Aggregate__Input): Promise<Result<__Aggregate__View, AppError>> {
    // id の形は、トランザクションに入る前に確かめる。
    if (!isValidDocIdSegment(input.id)) {
      return err(invalid('id has an invalid format'));
    }
    return this.transactionRunner.run(async (scope) => {
      const found = await this.repository.findById(input.id, scope);
      if (found === undefined) return err(notFound(`__aggregate__ not found: ${input.id}`));
      try {
        const closed = found.close();
        await this.repository.save(closed, scope);
        return ok(to__Aggregate__View(closed));
      } catch (error) {
        if (error instanceof __Aggregate__AlreadyClosedError) return err(error);
        throw error;
      }
    });
  }
}
