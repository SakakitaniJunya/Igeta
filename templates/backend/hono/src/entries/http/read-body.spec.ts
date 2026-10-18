import { describe, expect, it } from 'vitest';
import { INVALID_JSON, parseJsonBody, readBody } from './read-body.js';

function post(body: string | null, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/x', { method: 'POST', body, headers });
}

describe('readBody', () => {
  it('上限以内なら生のバイト列で返す', async () => {
    const raw = await readBody(post('{"a":1}'), 100);
    expect(raw?.toString('utf8')).toBe('{"a":1}');
  });

  it('上限を渡さなければ制限なし', async () => {
    const raw = await readBody(post('x'.repeat(10_000)));
    expect(raw?.length).toBe(10_000);
  });

  it('content-length が上限を超えていれば、読まずに undefined', async () => {
    const request = post('x', { 'content-length': '1000' });
    expect(await readBody(request, 10)).toBeUndefined();
    expect(request.bodyUsed).toBe(false);
  });

  it('content-length が無くても、読んだ量が上限を超えたら undefined', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(8)));
        controller.enqueue(new TextEncoder().encode('x'.repeat(8)));
        controller.close();
      },
    });
    const request = new Request('http://localhost/x', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    expect(await readBody(request, 10)).toBeUndefined();
  });

  it('本文が無ければ空のバイト列', async () => {
    const raw = await readBody(new Request('http://localhost/x'), 10);
    expect(raw?.length).toBe(0);
  });
});

describe('parseJsonBody', () => {
  it('JSON を unknown で返す', () => {
    expect(parseJsonBody(Buffer.from('{"a":1}'))).toEqual({ a: 1 });
  });

  it('空なら undefined', () => {
    expect(parseJsonBody(Buffer.alloc(0))).toBeUndefined();
  });

  it('JSON として読めなければ INVALID_JSON', () => {
    expect(parseJsonBody(Buffer.from('{oops'))).toBe(INVALID_JSON);
  });
});
