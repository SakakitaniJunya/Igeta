// ユースケースの雛形。application は domain と shared/kernel だけに依存する (application-is-framework-free)。
// HTTP も Firestore も知らない。失敗は投げずに Result で返し、HTTP の状態への変換は presentation が行う。

import { conflict, invalid, notFound, type AppError } from '../../../shared/kernel/app-error.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err, ok } from '../../../shared/kernel/result.js';
import type { TransactionRunner } from '../../../shared/kernel/transaction-runner.js';
import { isValidDocIdSegment } from '../../../shared/kernel/doc-id.js';
import { __Aggregate__AlreadyClosedError } from '../domain/errors/__aggregate__-already-closed.error.js';
import type { __Aggregate__Repository } from '../domain/ports/__aggregate__.repository.port.js';

export interface Close__Aggregate__Input {
  readonly id: string;
}

export interface Close__Aggregate__Output {
  readonly id: string;
  readonly status: 'closed';
}

/** <何をするか・どの API / 機能の ID か (例: API-102 / FN-016。ID は設計書のもの)>。 */
export class Close__Aggregate__UseCase {
  constructor(
    private readonly repository: __Aggregate__Repository,
    private readonly transactionRunner: TransactionRunner,
  ) {}

  async execute(input: Close__Aggregate__Input): Promise<Result<Close__Aggregate__Output, AppError>> {
    // 入力の形は、トランザクションに入る前に確かめる。
    if (!isValidDocIdSegment(input.id)) {
      return err(invalid('id has an invalid format'));
    }
    // 読んでから書く。読みと書きは同じトランザクションの中で行う。
    return this.transactionRunner.run(async (scope) => {
      const found = await this.repository.findById(input.id, scope);
      if (found === undefined) return err(notFound(`__aggregate__ not found: ${input.id}`));
      try {
        await this.repository.save(found.close(), scope);
      } catch (error) {
        if (error instanceof __Aggregate__AlreadyClosedError) return err(conflict('__aggregate__ already closed'));
        throw error;
      }
      return ok({ id: found.id, status: 'closed' as const });
    });
  }
}
