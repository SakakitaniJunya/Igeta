import { describe, expect, it } from 'vitest';
import {
  AppError,
  conflict,
  invalid,
  notFound,
  unauthorized,
  unavailable,
  unprocessable,
  type AppErrorKind,
} from '@/shared/domain/app-error.js';
import { apiError, fail, ok } from '@/shared/presentation/api-response.js';

describe('ok', () => {
  it('payload を {ok:true} に並べ、status は既定 200', () => {
    expect(ok({ item: { id: 'a' } })).toEqual({ status: 200, body: { ok: true, item: { id: 'a' } } });
  });

  it('status を指定できる', () => {
    expect(ok({ item: 1 }, 201).status).toBe(201);
  });
});

describe('apiError', () => {
  it('details が無ければ error に details を持たない', () => {
    expect(apiError(400, 'X', '理由')).toEqual({ status: 400, body: { ok: false, error: { code: 'X', message: '理由' } } });
  });

  it('details があれば error に載せる', () => {
    expect(apiError(400, 'X', '理由', ['name']).body).toEqual({
      ok: false,
      error: { code: 'X', message: '理由', details: ['name'] },
    });
  });
});

describe('fail', () => {
  it.each<[AppErrorKind, AppError, number, string]>([
    ['unauthorized', unauthorized('m'), 401, 'UNAUTHORIZED'],
    ['invalid', invalid('m'), 400, 'INVALID_REQUEST'],
    ['not_found', notFound('m'), 404, 'NOT_FOUND'],
    ['conflict', conflict('m'), 409, 'CONFLICT'],
    ['unprocessable', unprocessable('m'), 422, 'UNPROCESSABLE'],
    ['unavailable', unavailable('m'), 503, 'UNAVAILABLE'],
  ])('%s は status %i・code %s', (_kind, error, status, code) => {
    expect(fail(error)).toEqual({ status, body: { ok: false, error: { code, message: 'm' } } });
  });

  it('detail を details にする', () => {
    expect(fail(invalid('m', ['name'])).body).toEqual({ ok: false, error: { code: 'INVALID_REQUEST', message: 'm', details: ['name'] } });
  });

  it('未知の kind は投げる', () => {
    expect(() => fail(new AppError('unknown' as AppErrorKind, 'm'))).toThrow(/未対応/);
  });
});
