// README の「Firestore の使い方」と同じ手順を emulator で流す。project 名と collection 名だけが README と違う
import { expect, it } from 'vitest';
import { describeEmulator, EMULATOR_PROJECT } from '../testing/emulator';
import { memoMapper } from '../testing/memo-fixture';
import type { Memo } from '../testing/memo-fixture';
import { createFirestore } from './client';
import { FirestoreRepository } from './repository';
import { FirestoreTransactionRunner } from './transaction-runner';

describeEmulator('README の Firestore の例 (Firestore emulator)', () => {
  it('TST-408 README のとおり保存して list すると 1 件が返り、続きは無い', async () => {
    const db = createFirestore(EMULATOR_PROJECT);
    const collection = `readme_memos_${crypto.randomUUID()}`;
    const memos = new FirestoreRepository({
      db,
      collection,
      mapper: memoMapper,
      filterFields: (filter: { state?: Memo['state'] }) => ({ state: filter.state }),
    });
    const runner = new FirestoreTransactionRunner(db);

    await runner.run((scope) => memos.save({ id: 'm-1', title: 'はじめ', state: 'draft' }, scope));
    const page = await memos.list({ filter: { state: 'draft' }, limit: 20 });

    expect(page.items).toEqual([{ id: 'm-1', title: 'はじめ', state: 'draft' }]);
    expect(page.isTruncated).toBe(false);
    await db.collection(collection).doc('m-1').delete();
    await db.terminate();
  });
});
