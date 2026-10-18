import type { TransactionScope } from './transaction-scope.js';

/**
 * 1 つの Firestore トランザクションの中で複数のリポジトリを読み書きするための port。
 * 実体 (Firestore の `runTransaction`) は infrastructure 層が提供する。
 */
export interface TransactionRunner {
  run<T>(fn: (scope: TransactionScope) => Promise<T>): Promise<T>;
}
