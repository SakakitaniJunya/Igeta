import type { Firestore } from '@google-cloud/firestore';
import type { TransactionRunner } from '@/shared/domain/transaction-runner.js';
import type { TransactionScope } from '@/shared/domain/transaction-scope.js';
import { toScope } from '@/modules/__context__/infrastructure/firestore-scope.js';

/** 1 usecase = 1 トランザクション。fn が投げると巻き戻る。 */
export class FirestoreTransactionRunner implements TransactionRunner {
  constructor(private readonly db: Firestore) {}

  run<T>(fn: (scope: TransactionScope) => Promise<T>): Promise<T> {
    return this.db.runTransaction((tx) => fn(toScope(tx)));
  }
}
