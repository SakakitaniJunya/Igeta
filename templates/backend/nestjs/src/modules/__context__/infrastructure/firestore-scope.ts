import type { Transaction } from '@google-cloud/firestore';
import type { TransactionScope } from '@/shared/domain/transaction-scope.js';

/** infrastructure だけが知る、TransactionScope <-> Firestore Transaction の相互変換 (module ごとに 1 つ持つ)。 */
export function toTransaction(scope: TransactionScope): Transaction {
  return scope as unknown as Transaction;
}

export function toScope(tx: Transaction): TransactionScope {
  return tx as unknown as TransactionScope;
}
