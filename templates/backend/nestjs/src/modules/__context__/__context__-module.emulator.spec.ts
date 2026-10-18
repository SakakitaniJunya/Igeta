// 公開面 (index.ts の create__Context__Module) の配線のテスト。本物の部品を組み立て、エミュレータ越しに
// 「公開面の関数 → controller → usecase → Firestore」が 1 本につながっていることを確かめる。
// emulator が無ければ skip する (npm run test:emulator で実行)。

import { expect, it } from 'vitest';
import { create__Context__Module } from '@/modules/__context__/index.js';
import { createFirestore } from '@/shared/infrastructure/firestore.js';
import { describeEmulator, EMULATOR_PROJECT, uniqueId } from '@/shared/test-support/emulator.js';

interface ItemBody {
  ok: boolean;
  item: { id: string; name: string; status: string };
}

describeEmulator('create__Context__Module (Firestore エミュレータ)', () => {
  const module = create__Context__Module(createFirestore(EMULATOR_PROJECT));

  it('create → list → close が Firestore を通ってつながる', async () => {
    const created = await module.create__Aggregate__({ name: uniqueId('名前') });
    expect(created.status).toBe(201);
    const { id, name } = (created.body as ItemBody).item;

    const open = await module.list__Aggregate__Items({ status: 'open' });
    expect(open.status).toBe(200);
    expect((open.body as { items: ItemBody['item'][] }).items).toContainEqual({ id, name, status: 'open' });

    const closed = await module.close__Aggregate__(id);
    expect(closed).toEqual({ status: 200, body: { ok: true, item: { id, name, status: 'closed' } } });

    const again = await module.close__Aggregate__(id);
    expect(again.status).toBe(409);
  });

  it('無い id は 404', async () => {
    const response = await module.close__Aggregate__(uniqueId('missing'));
    expect(response.status).toBe(404);
  });

  it('意味の誤り (長すぎる名前) は 400 INVALID_REQUEST、形の誤りは 400 VALIDATION_FAILED', async () => {
    const tooLong = await module.create__Aggregate__({ name: 'x'.repeat(41) });
    expect((tooLong.body as { error: { code: string } }).error.code).toBe('INVALID_REQUEST');

    const wrongShape = await module.create__Aggregate__({ name: 1 });
    expect((wrongShape.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
  });
});
