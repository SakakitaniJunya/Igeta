import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { unauthorized } from '@/shared/domain/app-error.js';
import { err, ok } from '@/shared/domain/result.js';
import { ApiResponseException } from '@/entries/http/all-exceptions.filter.js';
import { __Entry__Guard, type __Entry__Request } from '@/entries/__entry__/__entry__.guard.js';

function contextOf(request: Partial<__Entry__Request>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

function requestOf(): Partial<__Entry__Request> {
  return {
    headers: { authorization: 'Bearer x' },
    protocol: 'https',
    originalUrl: '/__aggregates__?status=open',
    get: ((name: string) => (name === 'host' ? 'api.example.com' : undefined)) as __Entry__Request['get'],
    body: { never: 'read' },
  };
}

describe('__Entry__Guard', () => {
  it('検証に通れば true で、claims を request に載せる', async () => {
    const verify = vi.fn().mockResolvedValue(ok({ shop: 's-1' }));
    const request = requestOf();
    await expect(new __Entry__Guard(verify).canActivate(contextOf(request))).resolves.toBe(true);
    expect(request.claims).toEqual({ shop: 's-1' });
  });

  it('落ちたら 401 UNAUTHORIZED の例外を投げ、claims を載せない', async () => {
    const verify = vi.fn().mockResolvedValue(err(unauthorized('bad token')));
    const request = requestOf();
    const failure = await new __Entry__Guard(verify).canActivate(contextOf(request)).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiResponseException);
    expect((failure as ApiResponseException).apiResponse).toEqual({
      status: 401,
      body: { ok: false, error: { code: 'UNAUTHORIZED', message: 'bad token' } },
    });
    expect(request.claims).toBeUndefined();
  });

  it('検証にはヘッダと URL だけを渡し、本文は渡さない', async () => {
    const verify = vi.fn().mockResolvedValue(ok({ shop: 's-1' }));
    await new __Entry__Guard(verify).canActivate(contextOf(requestOf()));
    expect(verify).toHaveBeenCalledWith({
      headers: { authorization: 'Bearer x' },
      url: 'https://api.example.com/__aggregates__?status=open',
    });
  });
});
