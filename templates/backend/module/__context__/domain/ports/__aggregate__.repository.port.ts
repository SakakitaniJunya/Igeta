import type { TransactionScope } from '../../../../shared/kernel/transaction-scope.js';
import type { __Aggregate__ } from '../__aggregate__.js';

/**
 * port の雛形。ドメインの言葉のメソッドだけを出し、Firestore の型 (Transaction・Timestamp) は出さない。
 * 書き込みは必ず TransactionScope を受け取る (1 ユースケース = 1 トランザクション)。
 */
export interface __Aggregate__Repository {
  findById(id: string, scope?: TransactionScope): Promise<__Aggregate__ | undefined>;
  save(entity: __Aggregate__, scope: TransactionScope): Promise<void>;
}
