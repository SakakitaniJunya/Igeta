import { describe, expect, it } from 'vitest';
import type { Response } from 'express';
import { sendResponse } from '@/entries/http/send-response.js';

/** express の Response のうち使う部分だけの偽物。呼ばれた順を控える。 */
function fakeResponse() {
  const calls: Array<[string, unknown]> = [];
  const res = {
    status: (code: number) => (calls.push(['status', code]), res),
    set: (headers: unknown) => (calls.push(['set', headers]), res),
    type: (type: string) => (calls.push(['type', type]), res),
    send: (body: unknown) => (calls.push(['send', body]), res),
    end: () => (calls.push(['end', undefined]), res),
  };
  return { res: res as unknown as Response, calls };
}

describe('sendResponse', () => {
  it('status と JSON の本文を返す', () => {
    const { res, calls } = fakeResponse();
    sendResponse(res, { status: 201, body: { ok: true } });
    expect(calls).toEqual([
      ['status', 201],
      ['type', 'application/json'],
      ['send', '{"ok":true}'],
    ]);
  });

  it('追加のヘッダを載せる', () => {
    const { res, calls } = fakeResponse();
    sendResponse(res, { status: 429, body: { ok: false }, headers: { 'retry-after': '3' } });
    expect(calls).toContainEqual(['set', { 'retry-after': '3' }]);
  });

  it('本文が undefined なら本文なしで返す (204)', () => {
    const { res, calls } = fakeResponse();
    sendResponse(res, { status: 204, body: undefined });
    expect(calls).toEqual([
      ['status', 204],
      ['end', undefined],
    ]);
  });
});
