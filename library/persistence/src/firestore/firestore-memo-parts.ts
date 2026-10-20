/** Firestore の spec が使う、memo 用の repository・runner・契約の対象。 */
import type { Firestore } from '@google-cloud/firestore';
import type { ContractSubject } from '../testing/contract-types';
import { EMULATOR_PROJECT } from '../testing/emulator';
import { MALFORMED_MEMO_RECORDS, memoFilterFields, memoMapper } from '../testing/memo-fixture';
import type { Memo, MemoFilter, MemoRecord } from '../testing/memo-fixture';
import { createFirestore } from './client';
import { FirestoreRepository } from './repository';
import { FirestoreTransactionRunner } from './transaction-runner';

// 契約用の collection は実装ごとに名前を分ける
const CONTRACT_COLLECTION = 'contract_memos_firestore';

/** memo 用の Firestore の部品。 */
export interface FirestoreMemoParts {
  readonly db: Firestore;
  readonly collection: string;
  readonly repository: FirestoreRepository<Memo, MemoRecord, MemoFilter>;
  readonly runner: FirestoreTransactionRunner;
}

/** emulator に繋ぐ db と、それを使う repository・runner を作る。collection を変えると他のテストの行と混ざらない。 */
export function createFirestoreMemoParts(collection: string = CONTRACT_COLLECTION): FirestoreMemoParts {
  const db = createFirestore(EMULATOR_PROJECT);
  const repository = new FirestoreRepository({
    db,
    collection,
    mapper: memoMapper,
    filterFields: memoFilterFields,
  });

  return { db, collection, repository, runner: new FirestoreTransactionRunner(db) };
}

/** 契約の対象にする。壊れた保存データは生で置き、db は契約の最後に閉じる。 */
export function createFirestoreMemoSubject(parts: FirestoreMemoParts): ContractSubject<Memo, MemoFilter> {
  const { db, repository, runner } = parts;
  const collection = db.collection(CONTRACT_COLLECTION);
  const plantMalformed = async (kind: string, id: string): Promise<void> => {
    const record = MALFORMED_MEMO_RECORDS[kind];
    if (record === undefined) throw new Error(`知らない種類: ${kind}`);

    await collection.doc(id).set(record);
  };

  return {
    repository,
    runner,
    newId: () => crypto.randomUUID(),
    remove: async (id) => {
      await collection.doc(id).delete();
    },
    plantMalformed,
    close: () => db.terminate(),
  };
}
