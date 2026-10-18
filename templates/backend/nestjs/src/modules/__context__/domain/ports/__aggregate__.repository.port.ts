import type { TransactionScope } from '@/shared/domain/transaction-scope.js';
import type { __Aggregate__, __Aggregate__Status } from '@/modules/__context__/domain/__aggregate__.js';

export interface List__Aggregate__Query {
  /** 省くと全部。 */
  readonly status?: __Aggregate__Status | undefined;
  /** 返す件数の上限。 */
  readonly limit: number;
}

/**
 * 保存の口。ドメインの言葉のメソッドだけを出し、Firestore の型 (Transaction・Timestamp) は出さない。
 * 書き込みは必ず TransactionScope を受け取る (1 usecase = 1 トランザクション)。
 */
export interface __Aggregate__Repository {
  findById(id: string, scope?: TransactionScope): Promise<__Aggregate__ | undefined>;
  list(query: List__Aggregate__Query): Promise<ReadonlyArray<__Aggregate__>>;
  save(entity: __Aggregate__, scope: TransactionScope): Promise<void>;
}
