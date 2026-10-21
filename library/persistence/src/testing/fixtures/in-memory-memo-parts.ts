/** InMemory 実装の spec が使う、memo 用の保存先・repository・runner の組。 */
import { InMemoryRepository } from '#testing/in-memory/repository';
import { InMemoryStore } from '#testing/in-memory/store';
import { InMemoryTransactionRunner } from '#testing/in-memory/transaction-runner';
import { memoFilterFields, memoMapper } from './memo';
import type { Memo, MemoFilter, MemoRecord } from './memo';

/** memo 用の InMemory の部品。 */
export interface InMemoryParts {
  readonly store: InMemoryStore<MemoRecord>;
  readonly repository: InMemoryRepository<Memo, MemoRecord, MemoFilter>;
  readonly runner: InMemoryTransactionRunner<MemoRecord>;
}

/** 空の保存先と、それを使う repository・runner を作る。 */
export function createInMemoryParts(): InMemoryParts {
  const store = new InMemoryStore<MemoRecord>();
  const repository = new InMemoryRepository({ store, mapper: memoMapper, filterFields: memoFilterFields });
  const runner = new InMemoryTransactionRunner(store);

  return { store, repository, runner };
}
