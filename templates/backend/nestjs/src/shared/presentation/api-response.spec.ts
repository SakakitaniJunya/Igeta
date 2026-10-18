import { describe, expect, it } from 'vitest';
import { AppError, conflict, invalid, notFound, unauthorized, unavailable, unprocessable, type AppErrorKind } from '@/shared/domain/app-error.js';
import { apiError, fail, ok } from './api-response.js';

describe('ok', () => {
  it('ok:true にデータを平らに載せ、status は既定 200', () => {
    expect(ok({ items: [1] })).toEqual({ status: 200, body: { ok: true, items: [1] } });
  });

  it('status を指定できる', () => {
    expect(ok({ item: 'a' }, 201).status).toBe(201);
  });
});

describe('apiError', () => {
  it('ok:false と error.code / message を返し、details が無ければキー自体を出さない', () => {
    const res = apiError(404, 'NOT_FOUND', 'x');
    expect(res).toEqual({ status: 404, body: { ok: false, error: { code: 'NOT_FOUND', message: 'x' } } });
    expect('details' in (res.body as { error: object }).error).toBe(false);
  });

  it('details を運べる (形の検証の失敗は項目名の配列)', () => {
    const res = apiError(400, 'VALIDATION_FAILED', 'bad', ['name', 'status']);
    expect(res.body).toEqual({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'bad', details: ['name', 'status'] } });
  });
});

describe('fail', () => {
  it.each<[AppErrorKind, AppError, number, string]>([
    ['invalid', invalid('m'), 400, 'INVALID_REQUEST'],
    ['unauthorized', unauthorized('m'), 401, 'UNAUTHORIZED'],
    ['not_found', notFound('m'), 404, 'NOT_FOUND'],
    ['conflict', conflict('m'), 409, 'CONFLICT'],
    ['unprocessable', unprocessable('m'), 422, 'UNPROCESSABLE'],
    ['unavailable', unavailable('m'), 503, 'UNAVAILABLE'],
  ])('%s は status %i・code %s', (_kind, error, status, code) => {
    expect(fail(error)).toEqual({ status, body: { ok: false, error: { code, message: 'm' } } });
  });

  it('AppError の detail を details にして運ぶ', () => {
    expect(fail(invalid('m', ['name'])).body).toEqual({ ok: false, error: { code: 'INVALID_REQUEST', message: 'm', details: ['name'] } });
  });
});
