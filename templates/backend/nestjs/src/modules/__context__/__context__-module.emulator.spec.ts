// 公開面 (index.ts の create__Context__Module) の配線のテスト。本物の部品を組み立て、エミュレータ越しに
// 「公開面の関数 → controller → usecase → Firestore」が 1 本につながっていることを確かめる。
// エミュレータが無い (ふだんの npm test) ときは飛ばす (理由は題名に出る)。

import { expect, it } from 'vitest';
import { createFirestore } from '@/shared/infrastructure/firestore.js';
import { describeEmulator, EMULATOR_PROJECT, uniqueId } from '@/shared/test-support/emulator.js';
import { create__Context__Module } from './index.js';

interface ItemBody {
  readonly ok: boolean;
  readonly item: { readonly id: string; readonly name: string; readonly status: string };
}

describeEmulator('create__Context__Module (Firestore エミュレータ)', () => {
  const module = create__Context__Module(createFirestore(EMULATOR_PROJECT));

  it('create → list → close が Firestore を通ってつながる', async () => {
    const created = await module.create__Aggregate__({ name: '名前' });
    expect(created.status).toBe(201);
    const { item } = created.body as ItemBody;
    expect(item).toMatchObject({ name: '名前', status: 'open' });

    const listed = await module.list__Aggregate__Items({ status: 'open' });
    expect(listed.status).toBe(200);
    const listedBody = listed.body as { items: ReadonlyArray<{ id: string }>; truncated: boolean };
    expect(listedBody.items.map((row) => row.id)).toContain(item.id);

    const closed = await module.close__Aggregate__(item.id);
    expect(closed.status).toBe(200);
    expect((closed.body as ItemBody).item.status).toBe('closed');

    const again = await module.close__Aggregate__(item.id);
    expect(again.status).toBe(409);
  });

  it('無い id を閉じると 404', async () => {
    const response = await module.close__Aggregate__(uniqueId('missing'));
    expect(response.status).toBe(404);
  });

  it('形の悪い入力は 400 VALIDATION_FAILED', async () => {
    const response = await module.create__Aggregate__({ name: 1 });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED', details: ['name'] } });
  });
});
