import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { toResponse } from './to-response.js';
import type { HttpResponse } from '@/shared/presentation/response.js';

function respond(response: HttpResponse): Promise<Response> | Response {
  const app = new Hono();
  app.get('/x', (c) => toResponse(c, response));
  return app.request('/x');
}

describe('toResponse', () => {
  it('status と JSON の本文を返す', async () => {
    const res = await respond({ status: 201, body: { ok: true } });
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('追加のヘッダを足す', async () => {
    const res = await respond({ status: 429, body: {}, headers: { 'retry-after': '3' } });
    expect(res.headers.get('retry-after')).toBe('3');
  });

  it('本文が undefined なら空の応答 (204)', async () => {
    const res = await respond({ status: 204, body: undefined });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });
});
