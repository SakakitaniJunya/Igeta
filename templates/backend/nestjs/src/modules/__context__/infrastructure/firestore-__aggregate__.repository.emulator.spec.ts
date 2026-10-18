// Firestore エミュレータを通すテスト。emulator が無ければ skip する (npm run test:emulator で実行)。
// 同じエミュレータを全部のテストが共有し、消さない。id は毎回ユニークにしてテスト同士を分ける。

import { expect, it } from 'vitest';
import { __Aggregate__ } from '@/modules/__context__/domain/__aggregate__.js';
import { __Aggregate__Name } from '@/modules/__context__/domain/value-objects/__aggregate__-name.js';
import { Firestore__Aggregate__Repository } from '@/modules/__context__/infrastructure/firestore-__aggregate__.repository.js';
import { FirestoreTransactionRunner } from '@/modules/__context__/infrastructure/firestore-transaction-runner.js';
import { createFirestore } from '@/shared/infrastructure/firestore.js';
import { describeEmulator, EMULATOR_PROJECT, uniqueId } from '@/shared/test-support/emulator.js';

describeEmulator('Firestore__Aggregate__Repository (Firestore エミュレータ)', () => {
  const db = createFirestore(EMULATOR_PROJECT);
  const repository = new Firestore__Aggregate__Repository(db);
  const runner = new FirestoreTransactionRunner(db);
  const make = (id: string, status: 'open' | 'closed' = 'open') =>
    new __Aggregate__({ id, name: __Aggregate__Name.create('名前'), status });
  const saveAll = (...entities: __Aggregate__[]) =>
    runner.run(async (scope) => {
      for (const entity of entities) await repository.save(entity, scope);
    });

  it('保存して読み戻せる', async () => {
    const id = uniqueId();
    await saveAll(make(id));
    const found = await repository.findById(id);
    expect([found?.id, found?.name.value, found?.status]).toEqual([id, '名前', 'open']);
  });

  it('トランザクションの中でも読める', async () => {
    const id = uniqueId();
    await saveAll(make(id));
    const status = await runner.run(async (scope) => (await repository.findById(id, scope))?.status);
    expect(status).toBe('open');
  });

  it('無い id・形の悪い id は undefined', async () => {
    expect(await repository.findById(uniqueId('missing'))).toBeUndefined();
    expect(await repository.findById('../x')).toBeUndefined();
  });

  it('形の悪い id は保存できない', async () => {
    await expect(saveAll(make('a/b'))).rejects.toThrow('invalid doc id segment');
  });

  it('status で絞って一覧できる', async () => {
    const open = uniqueId('open');
    const closed = uniqueId('closed');
    await saveAll(make(open), make(closed, 'closed'));

    const openIds = (await repository.list({ status: 'open', limit: 10_000 })).map((entity) => entity.id);
    const closedIds = (await repository.list({ status: 'closed', limit: 10_000 })).map((entity) => entity.id);

    expect(openIds).toContain(open);
    expect(openIds).not.toContain(closed);
    expect(closedIds).toContain(closed);
    expect(closedIds).not.toContain(open);
  });

  it('limit で件数を切る', async () => {
    await saveAll(make(uniqueId()), make(uniqueId()));
    expect(await repository.list({ limit: 1 })).toHaveLength(1);
  });
});
