// ルートのテストの雛形。サーバを立てずに app.request() で投げる。モジュールの公開面は偽物にし、
// 「検証に落ちたら配下を呼ばない」「パスの値がそのまま渡る」「HttpResponse がそのまま返る」の 3 つを確かめる。

import { describe, expect, it, vi } from 'vitest';
import { unauthorized } from '../../shared/kernel/app-error.js';
import { err, ok } from '../../shared/kernel/result.js';
import type { __Context__Module } from '../../modules/__context__/index.js';
import { create__Entry__Routes } from './__entry__.routes.js';
import type { __Entry__Verifier } from './verify-__entry__.middleware.js';

const pass: __Entry__Verifier = async () => ok({ shop: 'example.myshopify.com' });
const fail: __Entry__Verifier = async () => err(unauthorized('bad signature'));

function fakeModule(): __Context__Module {
  return { close__Aggregate__: vi.fn().mockResolvedValue({ status: 200, body: { id: 'a-1', status: 'closed' } }) };
}

describe('create__Entry__Routes', () => {
  it('検証に通れば、パスの id を渡して応答をそのまま返す', async () => {
    const module = fakeModule();
    const app = create__Entry__Routes({ verify: pass, __contextVar__: module });

    const response = await app.request('/__aggregate__s/a-1/close', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'a-1', status: 'closed' });
    expect(module.close__Aggregate__).toHaveBeenCalledWith('a-1');
  });

  it('検証に落ちたら 401 で、配下を呼ばない', async () => {
    const module = fakeModule();
    const app = create__Entry__Routes({ verify: fail, __contextVar__: module });

    const response = await app.request('/__aggregate__s/a-1/close', { method: 'POST' });

    expect(response.status).toBe(401);
    expect(module.close__Aggregate__).not.toHaveBeenCalled();
  });
});
