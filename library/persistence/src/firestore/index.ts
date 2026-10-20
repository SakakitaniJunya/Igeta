/** firestore 入口。Firestore に保存する Repository と runner、クライアントの生成を公開する。 */
export { createFirestore, firestoreSettings } from './client';
export type { Environment } from './client';
export { translateFirestoreError } from './errors';
export { FirestoreRepository } from './repository';
export type { FirestoreRepositoryOptions } from './repository';
export { FirestoreTransactionRunner } from './transaction-runner';
