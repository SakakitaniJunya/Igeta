// 公開面 (index.ts の create__Context__Module) の配線のテスト。本物の部品を組み立て、エミュレータ越しに
// 「公開面の関数 → コントローラ → ユースケース → Firestore」が 1 本につながっていることを確かめる。
// FIRESTORE_EMULATOR_HOST が無い (ふだんの npm test) ときは飛ばす。

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFirestore } from '../../../platform/firestore.js';
import { __Aggregate__ } from '../domain/__aggregate__.js';
import { __Aggregate__Name } from '../domain/value-objects/__aggregate__-name.js';
import { create__Context__Module } from '../index.js';
import { Firestore__Aggregate__Repository } from '../infrastructure/firestore-__aggregate__.repository.js';
import { FirestoreTransactionRunner } from '../infrastructure/firestore-transaction-runner.js';

const describeEmulator = process.env['FIRESTORE_EMULATOR_HOST'] ? describe : describe.skip;

describeEmulator('create__Context__Module (Firestore エミュレータ)', () => {
  const db = createFirestore('__emulatorProject__');
  const module = create__Context__Module(db);

  it('close__Aggregate__ は 200 を返し、Firestore の状態が閉じる', async () => {
    const id = `a-${randomUUID()}`;
    const repository = new Firestore__Aggregate__Repository(db);
    await new FirestoreTransactionRunner(db).run((scope) =>
      repository.save(new __Aggregate__({ id, name: __Aggregate__Name.create('名前'), status: 'open' }), scope),
    );

    const response = await module.close__Aggregate__(id);

    expect(response).toEqual({ status: 200, body: { id, status: 'closed' } });
    expect((await repository.findById(id))?.status).toBe('closed');
  });

  it('無い id は 404', async () => {
    const response = await module.close__Aggregate__(`missing-${randomUUID()}`);
    expect(response.status).toBe(404);
  });
});
