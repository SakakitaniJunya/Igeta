/** Firestore の Transaction で work を実行する runner。 */
import type { Firestore } from '@google-cloud/firestore';
import type { TransactionRunner, TransactionScope } from '../core/transaction';
import { withFirestoreErrors } from './errors';
import { firestoreScopes } from './transaction-scope';

/** work を Firestore の 1 つの Transaction で実行する。衝突時は SDK が work を繰り返す。 */
export class FirestoreTransactionRunner implements TransactionRunner {
  private readonly db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  run<Result>(work: (scope: TransactionScope) => Promise<Result>): Promise<Result> {
    return withFirestoreErrors(() =>
      this.db.runTransaction(async (transaction) => {
        const scope = firestoreScopes.createScope(transaction);
        try {
          return await work(scope);
        } finally {
          firestoreScopes.endScope(scope);
        }
      }),
    );
  }
}
