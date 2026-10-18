// Firestore エミュレータを通す結合テスト。保存して読み戻せること・status で絞れること・上限で打ち切ることを確かめる。
// エミュレータが無いときは飛ばす (理由は題名に出る)。実行: npm run test:emulator (backend のパッケージで)
// 同じエミュレータを全部のテストが共有し、消さない。id は毎回ユニークにしてテスト同士を分ける。

import { expect, it } from 'vitest';
import { __Aggregate__, type __Aggregate__Status } from '@/modules/__context__/domain/__aggregate__.js';
import { __Aggregate__Name } from '@/modules/__context__/domain/value-objects/__aggregate__-name.js';
import { InvalidDocIdSegment } from '@/shared/domain/doc-id.js';
import { createFirestore } from '@/shared/infrastructure/firestore.js';
import { describeEmulator, EMULATOR_PROJECT, uniqueId } from '@/shared/test-support/emulator.js';
import { Firestore__Aggregate__Repository } from './firestore-__aggregate__.repository.js';
import { FirestoreTransactionRunner } from './firestore-transaction-runner.js';

describeEmulator('Firestore__Aggregate__Repository (Firestore エミュレータ)', () => {
  const db = createFirestore(EMULATOR_PROJECT);
  const repository = new Firestore__Aggregate__Repository(db);
  const runner = new FirestoreTransactionRunner(db);

  function make(id: string, status: __Aggregate__Status = 'open'): __Aggregate__ {
    return new __Aggregate__({ id, name: __Aggregate__Name.create('名前'), status });
  }

  async function save(entity: __Aggregate__): Promise<void> {
    await runner.run((scope) => repository.save(entity, scope));
  }

  it('保存して読み戻せる', async () => {
    const id = uniqueId();
    await save(make(id));

    const found = await repository.findById(id);

    expect(found?.id).toBe(id);
    expect(found?.name.value).toBe('名前');
    expect(found?.status).toBe('open');
  });

  it('無い id は undefined。形の悪い id は読みに行かず undefined', async () => {
    expect(await repository.findById(uniqueId('missing'))).toBeUndefined();
    expect(await repository.findById('../x')).toBeUndefined();
  });

  it('形の悪い id は保存で投げる', async () => {
    await expect(save(make('a/b'))).rejects.toThrow(InvalidDocIdSegment);
  });

  it('同じ id への保存は上書きで、状態が変わる', async () => {
    const id = uniqueId();
    await save(make(id));
    await save(make(id).close());
    expect((await repository.findById(id))?.status).toBe('closed');
  });

  it('status で絞り込める', async () => {
    const openId = uniqueId();
    const closedId = uniqueId();
    await save(make(openId));
    await save(make(closedId, 'closed'));

    const closedIds = (await repository.list('closed', 1000)).map((row) => row.id);
    const openIds = (await repository.list('open', 1000)).map((row) => row.id);

    expect(closedIds).toContain(closedId);
    expect(closedIds).not.toContain(openId);
    expect(openIds).toContain(openId);
  });

  it('保存済みの doc が不変条件を外れている (name が長すぎる・文字列でない・status が不正) と、findById は doc id つきの unprocessable', async () => {
    const collection = db.collection('__aggregates__');
    const longId = uniqueId('long');
    const typeId = uniqueId('type');
    const statusId = uniqueId('status');
    await collection.doc(longId).set({ name: 'x'.repeat(41), status: 'open' });
    await collection.doc(typeId).set({ name: 1, status: 'open' });
    await collection.doc(statusId).set({ name: '名前', status: 'done' });

    try {
      for (const id of [longId, typeId, statusId]) {
        await expect(repository.findById(id)).rejects.toMatchObject({ kind: 'unprocessable', detail: { id } });
      }
    } finally {
      // 共有のエミュレータで、list を読む他のテストが壊れた doc に当たらないよう、すぐ消す (list も同じ toDomain を通る)。
      await Promise.all([longId, typeId, statusId].map((id) => collection.doc(id).delete()));
    }
  });

  it('limit 件で打ち切る', async () => {
    await save(make(uniqueId()));
    await save(make(uniqueId()));
    expect(await repository.list(undefined, 1)).toHaveLength(1);
  });
});
