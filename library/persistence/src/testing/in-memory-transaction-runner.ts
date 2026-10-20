/** InMemoryStore を Transaction で包む runner。 */
import type { TransactionRunner, TransactionScope } from '../core/transaction';
import type { InMemoryStore } from './in-memory-store';

/** InMemoryStore の書き込みを 1 つの Transaction にまとめる。 */
export class InMemoryTransactionRunner<StoredRecord> implements TransactionRunner {
  private readonly store: InMemoryStore<StoredRecord>;

  constructor(store: InMemoryStore<StoredRecord>) {
    this.store = store;
  }

  run<Result>(work: (scope: TransactionScope) => Promise<Result>): Promise<Result> {
    return this.store.runInTransaction(work);
  }
}
