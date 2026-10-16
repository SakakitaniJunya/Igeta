import type { Firestore } from '@google-cloud/firestore';
import type { TransactionRunner } from '../../../shared/kernel/transaction-runner.js';
import type { TransactionScope } from '../../../shared/kernel/transaction-scope.js';
import { toScope } from './firestore-scope.js';

export class FirestoreTransactionRunner implements TransactionRunner {
  constructor(private readonly db: Firestore) {}

  run<T>(fn: (scope: TransactionScope) => Promise<T>): Promise<T> {
    return this.db.runTransaction((tx) => fn(toScope(tx)));
  }
}
