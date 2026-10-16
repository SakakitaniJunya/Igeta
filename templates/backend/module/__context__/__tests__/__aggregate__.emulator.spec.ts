// Firestore エミュレータを通す結合テストの雛形。FIRESTORE_EMULATOR_HOST が無い (ふだんの npm test) ときは飛ばす。
// 実行: npm run test:emulator (backend のパッケージで)
// 同じエミュレータを全部のテストが共有し、消さない。id は毎回ユニークにしてテスト同士を分ける。

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFirestore } from '../../../platform/firestore.js';
import { __Aggregate__ } from '../domain/__aggregate__.js';
import { __Aggregate__Name } from '../domain/value-objects/__aggregate__-name.js';
import { Close__Aggregate__UseCase } from '../application/close-__aggregate__.usecase.js';
import { Firestore__Aggregate__Repository } from '../infrastructure/firestore-__aggregate__.repository.js';
import { FirestoreTransactionRunner } from '../infrastructure/firestore-transaction-runner.js';

const describeEmulator = process.env['FIRESTORE_EMULATOR_HOST'] ? describe : describe.skip;

describeEmulator('Close__Aggregate__UseCase (Firestore エミュレータ)', () => {
  const db = createFirestore('__emulatorProject__');
  const repository = new Firestore__Aggregate__Repository(db);
  const runner = new FirestoreTransactionRunner(db);
  const useCase = new Close__Aggregate__UseCase(repository, runner);

  it('閉じた状態が Firestore に残る', async () => {
    const id = `a-${randomUUID()}`;
    await runner.run((scope) => repository.save(new __Aggregate__({ id, name: __Aggregate__Name.create('名前'), status: 'open' }), scope));

    const result = await useCase.execute({ id });

    expect(result.ok).toBe(true);
    expect((await repository.findById(id))?.status).toBe('closed');
  });
});
