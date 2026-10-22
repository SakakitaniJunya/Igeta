// Firestore エミュレータを通す結合テスト。エミュレータが無いときは飛ばす (理由は題名に出る)。
// 実行: npm run test:emulator (backend のパッケージで)

import { expect, it } from 'vitest';
import { createFirestore } from '@/shared/infrastructure/firestore.js';
import { describeEmulator, EMULATOR_PROJECT, uniqueId } from '@/shared/test-support/emulator.js';
import { toTransaction } from './scope.js';
import { FirestoreTransactionRunner } from './transaction-runner.js';

describeEmulator('FirestoreTransactionRunner (Firestore エミュレータ)', () => {
  const db = createFirestore(EMULATOR_PROJECT);
  const runner = new FirestoreTransactionRunner(db);

  it('成功すれば書き込みが確定し、fn の戻り値を返す', async () => {
    const ref = db.collection('tx-check').doc(uniqueId());
    const value = await runner.run(async (scope) => {
      toTransaction(scope).set(ref, { n: 1 });
      return 'done';
    });
    expect(value).toBe('done');
    expect((await ref.get()).data()).toEqual({ n: 1 });
  });

  it('fn が投げれば書き込みは巻き戻り、エラーはそのまま出る', async () => {
    const ref = db.collection('tx-check').doc(uniqueId());
    await expect(
      runner.run(async (scope) => {
        toTransaction(scope).set(ref, { n: 1 });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await ref.get()).exists).toBe(false);
  });
});
