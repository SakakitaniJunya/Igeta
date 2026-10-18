// エンドポイントのテスト: 一覧は GET・作るは POST (名称だけの本文)・閉じるは POST (id は符号化)・失敗の形は呼び出し元へそのまま届く。

import { describe, expect, it } from 'vitest';
import { close__Feature__, create__Feature__, list__Feature__ } from '@/features/__feature__/infrastructure/__feature__.endpoint';
import { dtoFixture } from '@/features/__feature__/test-support/__feature__.fixtures';
import { fakeApi } from '@/shared/test-support/fake-api';

const ITEM = dtoFixture();

describe('__feature__.endpoint', () => {
  it('一覧は GET /admin/api/__feature__。応答は変換せずそのまま返す', async () => {
    const api = fakeApi({ 'GET /admin/api/__feature__': { status: 200, body: { items: [ITEM], truncated: false } } });
    const result = await list__Feature__(api);
    expect(result).toEqual({ ok: true, status: 200, body: { items: [ITEM], truncated: false } });
    expect(api.calls).toEqual([{ method: 'GET', path: '/admin/api/__feature__' }]);
  });

  it('作るは POST で名称だけを送る', async () => {
    const api = fakeApi({ 'POST /admin/api/__feature__': { status: 201, body: { ok: true, item: ITEM } } });
    await create__Feature__(api, { name: '見本' });
    expect(api.calls).toEqual([{ method: 'POST', path: '/admin/api/__feature__', body: { name: '見本' } }]);
  });

  it('閉じるは POST で、id は URL に入れるため符号化する', async () => {
    const api = fakeApi({ 'POST /admin/api/__feature__/a%2F1/close': { status: 200, body: { ok: true, item: ITEM } } });
    await close__Feature__(api, 'a/1');
    expect(api.calls).toEqual([{ method: 'POST', path: '/admin/api/__feature__/a%2F1/close', body: undefined }]);
  });

  it('失敗の code と状態はそのまま返る', async () => {
    const api = fakeApi({ 'POST /admin/api/__feature__/a-1/close': { status: 409, body: { ok: false, error: { code: 'CONFLICT', message: 'x' } } } });
    const result = await close__Feature__(api, 'a-1');
    expect(result).toEqual({ ok: false, status: 409, error: { code: 'CONFLICT', message: 'x' } });
  });
});
