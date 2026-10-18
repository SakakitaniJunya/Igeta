// Firestore エミュレータを通すテスト。emulator が無ければ skip する (npm run test:emulator で実行)。
// 同じエミュレータを全部のテストが共有し、消さない。id は毎回ユニークにしてテスト同士を分ける。

import { expect, it } from 'vitest';
import { __Aggregate__ } from '@/modules/__context__/domain/__aggregate__.js';
import { __Aggregate__Name } from '@/modules/__context__/domain/value-objects/__aggregate__-name.js';
import { Firestore__Aggregate__Repository } from '@/modules/__context__/infrastructure/firestore-__aggregate__.repository.js';
import { FirestoreTransactionRunner } from '@/modules/__context__/infrastructure/firestore-transaction-runner.js';
import { createFirestore } from '@/shared/infrastructure/firestore.js';
import { describeEmulator, EMULATOR_PROJECT, uniqueId } from '@/shared/test-support/emulator.js';

describeEmulator('FirestoreTransactionRunner (Firestore エミュレータ)', () => {
  const db = createFirestore(EMULATOR_PROJECT);
  const repository = new Firestore__Aggregate__Repository(db);
  const runner = new FirestoreTransactionRunner(db);
  const make = (id: string) => new __Aggregate__({ id, name: __Aggregate__Name.create('名前'), status: 'open' });

  it('成功すると確定し、fn の戻り値を返す', async () => {
    const id = uniqueId();
    const returned = await runner.run(async (scope) => {
      await repository.save(make(id), scope);
      return 'done';
    });
    expect(returned).toBe('done');
    expect((await repository.findById(id))?.id).toBe(id);
  });

  it('fn が投げると巻き戻り、書いた物は残らない', async () => {
    const id = uniqueId();
    await expect(
      runner.run(async (scope) => {
        await repository.save(make(id), scope);
        throw new Error('途中で失敗');
      }),
    ).rejects.toThrow('途中で失敗');
    expect(await repository.findById(id)).toBeUndefined();
  });
});
