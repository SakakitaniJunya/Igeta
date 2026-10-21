/** firestore 入口。Firestore に保存する Repository と runner、クライアントの生成を公開する。 */
export { createFirestore, firestoreSettings } from '#firestore/client/client';
export type { Environment } from '#firestore/client/client';
export { translateFirestoreError } from '#firestore/client/errors';
export { FirestoreRepository } from '#firestore/repository/repository';
export type { FirestoreRepositoryOptions } from '#firestore/repository/repository';
export { FirestoreTransactionRunner } from '#firestore/transaction/transaction-runner';
