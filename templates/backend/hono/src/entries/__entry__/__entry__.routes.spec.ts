// ルートのテストの雛形。サーバを立てずに app.request() で投げる。module の公開面と verify は偽物にし、
// 「検証に落ちたら配下を呼ばない」「本文と id が unknown のまま渡る」「本文の上限と JSON 構文」「応答がそのまま返る」を確かめる。

import { describe, expect, it, vi } from 'vitest';
import type { __Context__Module } from '@/modules/__context__/index.js';
import { unauthorized } from '@/shared/domain/app-error.js';
import { err, ok } from '@/shared/domain/result.js';
import { BODY_LIMIT_BYTES, create__Entry__Routes } from './__entry__.routes.js';
import type { __Entry__Verifier } from './verify-__entry__.middleware.js';

const pass: __Entry__Verifier = async () => ok({ subject: 'user-1' });
const deny: __Entry__Verifier = async () => err(unauthorized('bad signature'));

function fakeModule(): __Context__Module {
  return {
    list__Aggregate__Items: vi.fn().mockResolvedValue({ status: 200, body: { ok: true, items: [], truncated: false } }),
    create__Aggregate__: vi.fn().mockResolvedValue({ status: 201, body: { ok: true, item: { id: 'a-1' } } }),
    close__Aggregate__: vi.fn().mockResolvedValue({ status: 200, body: { ok: true, item: { id: 'a-1' } } }),
  };
}

function post(body: string, path = '/__aggregates__'): [string, RequestInit] {
  return [path, { method: 'POST', body, headers: { 'content-type': 'application/json' } }];
}

describe('create__Entry__Routes', () => {
  it('検証に落ちたら 401 で、どの経路でも配下を呼ばない', async () => {
    const module = fakeModule();
    const app = create__Entry__Routes({ verify: deny, __contextVar__: module });

    for (const [path, init] of [['/__aggregates__', {}], post('{}'), ['/__aggregates__/a-1/close', { method: 'POST' }]] as const) {
      const response = await app.request(path, init);
      expect(response.status).toBe(401);
    }
    expect(module.list__Aggregate__Items).not.toHaveBeenCalled();
    expect(module.create__Aggregate__).not.toHaveBeenCalled();
    expect(module.close__Aggregate__).not.toHaveBeenCalled();
  });

  it('GET: query をそのまま渡し、応答を返す', async () => {
    const module = fakeModule();
    const app = create__Entry__Routes({ verify: pass, __contextVar__: module });

    const response = await app.request('/__aggregates__?status=open');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, items: [], truncated: false });
    expect(module.list__Aggregate__Items).toHaveBeenCalledWith({ status: 'open' });
  });

  it('GET: verify が使う引数など余計な query が付いても、入口は落とさず query 全体を渡す', async () => {
    const module = fakeModule();
    const app = create__Entry__Routes({ verify: pass, __contextVar__: module });

    const response = await app.request('/__aggregates__?status=open&signature=abc&host=x');

    expect(response.status).toBe(200);
    expect(module.list__Aggregate__Items).toHaveBeenCalledWith({ status: 'open', signature: 'abc', host: 'x' });
  });

  it('POST: 本文を検証せず unknown のまま渡す (形の悪い本文でも入口は通す)', async () => {
    const module = fakeModule();
    const app = create__Entry__Routes({ verify: pass, __contextVar__: module });

    const response = await app.request(...post('{"name":1,"extra":true}'));

    expect(response.status).toBe(201);
    expect(module.create__Aggregate__).toHaveBeenCalledWith({ name: 1, extra: true });
  });

  it('POST: 空の本文は undefined で渡る', async () => {
    const module = fakeModule();
    const app = create__Entry__Routes({ verify: pass, __contextVar__: module });

    await app.request('/__aggregates__', { method: 'POST' });

    expect(module.create__Aggregate__).toHaveBeenCalledWith(undefined);
  });

  it('POST: 不正な JSON は 400 で、配下を呼ばない', async () => {
    const module = fakeModule();
    const app = create__Entry__Routes({ verify: pass, __contextVar__: module });

    const response = await app.request(...post('{oops'));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'MALFORMED_REQUEST' } });
    expect(module.create__Aggregate__).not.toHaveBeenCalled();
  });

  it('POST: 本文が上限を超えたら 413 で、配下を呼ばない', async () => {
    const module = fakeModule();
    const app = create__Entry__Routes({ verify: pass, __contextVar__: module });

    const response = await app.request(...post(JSON.stringify({ name: 'x'.repeat(BODY_LIMIT_BYTES) })));

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE' } });
    expect(module.create__Aggregate__).not.toHaveBeenCalled();
  });

  it('close: パスの id を unknown のまま渡し、応答をそのまま返す', async () => {
    const module = fakeModule();
    const app = create__Entry__Routes({ verify: pass, __contextVar__: module });

    const response = await app.request('/__aggregates__/a-1/close', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(module.close__Aggregate__).toHaveBeenCalledWith('a-1');
  });
});
