import type { __Aggregate__, __Aggregate__Status } from '@/modules/__context__/domain/__aggregate__.js';
import type { TransactionScope } from '@/shared/domain/transaction-scope.js';

/**
 * port の雛形。ドメインの言葉のメソッドだけを出し、Firestore の型 (Transaction・Timestamp) は出さない。
 * 書き込みは必ず TransactionScope を受け取る (1 ユースケース = 1 トランザクション)。
 */
export interface __Aggregate__Repository {
  findById(id: string, scope?: TransactionScope): Promise<__Aggregate__ | undefined>;
  /** status を省くと全部の状態。limit 件までを id の昇順で返す。 */
  list(status: __Aggregate__Status | undefined, limit: number): Promise<ReadonlyArray<__Aggregate__>>;
  save(entity: __Aggregate__, scope: TransactionScope): Promise<void>;
}
