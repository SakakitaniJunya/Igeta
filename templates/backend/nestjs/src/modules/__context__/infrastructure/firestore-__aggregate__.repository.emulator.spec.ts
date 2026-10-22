// Firestore エミュレータを通す結合テスト。共通の契約 (C1〜C9) は test-support の契約テストが持ち、ここは Firestore だけの行を持つ。
// エミュレータが無いときは飛ばす (理由は題名に出る)。実行: npm run test:emulator (backend のパッケージで)

import { expect, it } from 'vitest';
import { __Aggregate__ } from '@/modules/__context__/domain/__aggregate__.js';
import { __Aggregate__Name } from '@/modules/__context__/domain/value-objects/__aggregate__-name.js';
import { describe__Aggregate__RepositoryContract } from '@/modules/__context__/test-support/__aggregate__-repository.contract.js';
import { InvalidDocIdSegment } from '@/shared/domain/doc-id.js';
import { createFirestore } from '@/shared/infrastructure/firestore.js';
import { describeEmulator, EMULATOR_PROJECT, uniqueId } from '@/shared/test-support/emulator.js';
import { Firestore__Aggregate__Repository } from './firestore-__aggregate__.repository.js';
import { FirestoreTransactionRunner } from './firestore-transaction-runner.js';

describeEmulator('Firestore__Aggregate__Repository (Firestore エミュレータ)', () => {
  const db = createFirestore(EMULATOR_PROJECT);
  const repository = new Firestore__Aggregate__Repository(db);
  const runner = new FirestoreTransactionRunner(db);
  const collection = db.collection('__aggregates__');
  const planted: string[] = [];

  describe__Aggregate__RepositoryContract('Firestore', () => ({
    repository,
    runner,
    newId: () => uniqueId(),
    // 壊れた doc を生で置く。置いた id は cleanup が消す。
    plantMalformed: async (id, kind) => {
      planted.push(id);
      const doc = {
        'long-name': { name: 'x'.repeat(41), status: 'open' },
        'bad-status': { name: '名前', status: 'done' },
        'name-not-string': { name: 1, status: 'open' },
      }[kind];
      await collection.doc(id).set(doc);
    },
    cleanup: async () => {
      await Promise.all(planted.splice(0).map((id) => collection.doc(id).delete()));
    },
  }));

  // ここから下は Firestore だけの行 (doc id の規則)。
  it('形の悪い id は読みに行かず undefined', async () => {
    expect(await repository.findById('../x')).toBeUndefined();
  });

  it('形の悪い id は保存で投げる', async () => {
    const entity = new __Aggregate__({ id: 'a/b', name: __Aggregate__Name.create('名前'), status: 'open' });
    await expect(runner.run((scope) => repository.save(entity, scope))).rejects.toThrow(InvalidDocIdSegment);
  });
});
