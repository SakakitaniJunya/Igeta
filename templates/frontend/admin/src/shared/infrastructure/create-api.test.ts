// 管理 API の呼び出しのテスト: Bearer・本文の JSON・401 の再送 (1 回だけ)・失敗の error の受け渡し・通信できないときは投げず status 0。

import { describe, expect, it, vi } from 'vitest';
import { createApi } from '@/shared/infrastructure/create-api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('createApi', () => {
  it('Bearer を付けて送り、成功は ok と本文。query は空と未定義を除く', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(200, { ok: true, items: [] }));
    const api = createApi(async () => 'tok', fetchImpl);

    const result = await api.get('/admin/api/samples', { page: 2, empty: '', none: undefined });

    expect(result).toEqual({ ok: true, status: 200, body: { ok: true, items: [] } });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('/admin/api/samples?page=2');
    expect((init?.headers as Record<string, string>)['authorization']).toBe('Bearer tok');
  });

  it('本文は JSON にして送る', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(201, {}));
    await createApi(async () => 'tok', fetchImpl).post('/admin/api/samples', { name: 'x' });
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"name":"x"}');
    expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('401 ならトークンを取り直して 1 回だけ再送する', async () => {
    const getToken = vi.fn(async () => 'tok');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(401, {})).mockResolvedValueOnce(jsonResponse(200, { a: 1 }));
    const result = await createApi(getToken, fetchImpl).get('/admin/api/samples');
    expect(result.ok).toBe(true);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('2 回続けて 401 なら、それ以上は送らず 2 回目の応答 (status と error) を返す', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'FIRST', message: 'first' } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'SECOND', message: 'second' } }));
    const result = await createApi(async () => 'tok', fetchImpl).get('/admin/api/samples');
    expect(result).toEqual({ ok: false, status: 401, error: { code: 'SECOND', message: 'second' } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('失敗の本文の error を返す', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(409, { ok: false, error: { code: 'NAME_TAKEN', message: 'taken' } }));
    const result = await createApi(async () => 'tok', fetchImpl).post('/admin/api/samples', {});
    expect(result).toEqual({ ok: false, status: 409, error: { code: 'NAME_TAKEN', message: 'taken' } });
  });

  it('通信できない・トークンが取れないときは投げずに status 0', async () => {
    const offline = createApi(async () => 'tok', vi.fn<typeof fetch>(async () => Promise.reject(new TypeError('offline'))));
    const noToken = createApi(async () => Promise.reject(new Error('no token')), vi.fn<typeof fetch>());
    expect(await offline.get('/admin/api/samples')).toEqual({ ok: false, status: 0, error: null });
    expect(await noToken.get('/admin/api/samples')).toEqual({ ok: false, status: 0, error: null });
  });
});
