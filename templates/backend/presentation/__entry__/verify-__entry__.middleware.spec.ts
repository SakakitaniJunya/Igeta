// 検証ミドルウェア単体のテスト。小さな Hono のアプリに掛けて、通る・落ちる・値を渡すの 3 つを確かめる。

import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { unauthorized } from '../../shared/kernel/app-error.js';
import { err, ok } from '../../shared/kernel/result.js';
import { verify__Entry__, type __Entry__Env, type __Entry__Verifier } from './verify-__entry__.middleware.js';

function appWith(verify: __Entry__Verifier) {
  const app = new Hono<__Entry__Env>();
  app.use('*', verify__Entry__(verify));
  app.get('/probe', (c) => c.json({ shop: c.get('claims').shop }));
  return app;
}

describe('verify__Entry__', () => {
  it('通れば配下に進み、検証済みの値を c.get で読める', async () => {
    const response = await appWith(async () => ok({ shop: 'example.myshopify.com' })).request('/probe');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ shop: 'example.myshopify.com' });
  });

  it('落ちたら 401 で、配下を呼ばない', async () => {
    const handler = vi.fn();
    const app = new Hono<__Entry__Env>();
    app.use('*', verify__Entry__(async () => err(unauthorized('bad signature'))));
    app.get('/probe', handler);

    const response = await app.request('/probe');

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: 'bad signature' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('検証にはヘッダと URL だけを渡す (本文は渡さない)', async () => {
    const verify = vi.fn<__Entry__Verifier>(async () => ok({ shop: 's' }));
    await appWith(verify).request('/probe?x=1', { headers: { 'x-signature': 'abc' } });
    const input = verify.mock.calls[0]?.[0];
    expect(input?.url).toContain('/probe?x=1');
    expect(input?.headers.get('x-signature')).toBe('abc');
    expect(Object.keys(input ?? {})).toEqual(['headers', 'url']);
  });
});
