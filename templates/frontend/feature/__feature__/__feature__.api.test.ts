// API の呼び出しのテスト。パス・メソッド・本文が API 仕様どおりかだけを確かめる (通信は偽の API)。

import { describe, expect, it } from 'vitest';
import { fakeApi } from '../../test-support/fake-api';
import { list__Feature__, update__Feature__ } from './__feature__.api';

describe('__feature__.api', () => {
  it('一覧は GET /admin/api/__feature__', async () => {
    const api = fakeApi({ 'GET /admin/api/__feature__': { status: 200, body: { items: [] } } });
    const result = await list__Feature__(api);
    expect(result).toEqual({ ok: true, status: 200, body: { items: [] } });
    expect(api.calls).toEqual([{ method: 'GET', path: '/admin/api/__feature__' }]);
  });

  it('更新は PUT で、id は URL に入れるため符号化する', async () => {
    const api = fakeApi();
    await update__Feature__(api, 'a/1', { name: '名前', active: false });
    expect(api.calls).toEqual([{ method: 'PUT', path: '/admin/api/__feature__/a%2F1', body: { name: '名前', active: false } }]);
  });
});
