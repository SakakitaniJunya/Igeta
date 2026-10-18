// ユースケースの雛形 (閉じる)。application は domain と shared/domain だけに依存する (application-is-framework-free)。
// HTTP も Firestore も知らない。失敗は投げずに Result で返し、HTTP の状態への変換は presentation が行う。

import type { __Aggregate__ } from '@/modules/__context__/domain/__aggregate__.js';
import { __Aggregate__AlreadyClosedError } from '@/modules/__context__/domain/errors/__aggregate__-already-closed.error.js';
import type { __Aggregate__Repository } from '@/modules/__context__/domain/ports/__aggregate__.repository.port.js';
import { to__Aggregate__View, type __Aggregate__View } from '@/modules/__context__/application/create-__aggregate__.usecase.js';
import { AppError, conflict, invalid, notFound } from '@/shared/domain/app-error.js';
import { isValidDocIdSegment } from '@/shared/domain/doc-id.js';
import { err, ok, type Result } from '@/shared/domain/result.js';
import type { TransactionRunner } from '@/shared/domain/transaction-runner.js';

export interface Close__Aggregate__Input {
  readonly id: string;
}

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
    // 読んでから書く。読みと書きは同じトランザクションの中で行う (1 usecase = 1 Tx)。
    return this.transactionRunner.run(async (scope) => {
      let found: __Aggregate__ | undefined;
      try {
        found = await this.repository.findById(input.id, scope);
      } catch (error) {
        // 保存済みの doc が不変条件を満たさないとき、repository は AppError (unprocessable) を投げる。
        if (error instanceof AppError) return err(error);
        throw error;
      }
      if (found === undefined) return err(notFound(`__aggregate__ not found: ${input.id}`));
      try {
        const closed = found.close();
        await this.repository.save(closed, scope);
        return ok(to__Aggregate__View(closed));
      } catch (error) {
        if (error instanceof __Aggregate__AlreadyClosedError) return err(conflict('__aggregate__ already closed'));
        throw error;
      }
    });
  }
}
