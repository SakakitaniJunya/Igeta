// コントローラのテストの雛形。ユースケースは execute だけを持つ偽物にし、状態と本文の対応だけを確かめる。

import { describe, expect, it, vi } from 'vitest';
import type { Close__Aggregate__UseCase } from '@/modules/__context__/application/close-__aggregate__.usecase.js';
import type { Create__Aggregate__UseCase } from '@/modules/__context__/application/create-__aggregate__.usecase.js';
import type { List__Aggregate__ItemsUseCase } from '@/modules/__context__/application/list-__aggregates__.usecase.js';
import { conflict, invalid, notFound, unauthorized, unavailable, unprocessable, type AppError, type AppErrorKind } from '@/shared/domain/app-error.js';
import { err, ok } from '@/shared/domain/result.js';
import { handleClose__Aggregate__, handleCreate__Aggregate__, handleList__Aggregate__Items } from './__aggregate__.controller.js';

const VIEW = { id: 'a-1', name: '名前', status: 'open' as const };

function stub<T extends { execute: (...args: never[]) => unknown }>(execute: T['execute']): T {
  return { execute } as unknown as T;
}

describe('handleList__Aggregate__Items', () => {
  it('成功は 200 と { ok, items, truncated }。通った query が usecase に渡る', async () => {
    const execute = vi.fn().mockResolvedValue(ok({ items: [VIEW], truncated: false }));
    const response = await handleList__Aggregate__Items(stub<List__Aggregate__ItemsUseCase>(execute), { status: 'open' });
    expect(response).toEqual({ status: 200, body: { ok: true, items: [VIEW], truncated: false } });
    expect(execute).toHaveBeenCalledWith({ status: 'open' });
  });

  it('形が悪ければ 400 VALIDATION_FAILED と項目名で、usecase を呼ばない', async () => {
    const execute = vi.fn();
    const response = await handleList__Aggregate__Items(stub<List__Aggregate__ItemsUseCase>(execute), { status: 'done' });
    expect(response).toEqual({
      status: 400,
      body: { ok: false, error: { code: 'VALIDATION_FAILED', message: 'request validation failed', details: ['status'] } },
    });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('handleCreate__Aggregate__', () => {
  it('成功は 201 と { ok, item }', async () => {
    const execute = vi.fn().mockResolvedValue(ok(VIEW));
    const response = await handleCreate__Aggregate__(stub<Create__Aggregate__UseCase>(execute), { name: '名前' });
    expect(response).toEqual({ status: 201, body: { ok: true, item: VIEW } });
    expect(execute).toHaveBeenCalledWith({ name: '名前' });
  });

  it('形が悪ければ 400 VALIDATION_FAILED と項目名', async () => {
    const execute = vi.fn();
    const response = await handleCreate__Aggregate__(stub<Create__Aggregate__UseCase>(execute), { name: 1 });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED', details: ['name'] } });
    expect(execute).not.toHaveBeenCalled();
  });

  it('意味の誤り (usecase の invalid) は 400 INVALID_REQUEST', async () => {
    const response = await handleCreate__Aggregate__(stub<Create__Aggregate__UseCase>(vi.fn().mockResolvedValue(err(invalid('too long')))), { name: 'x' });
    expect(response).toEqual({ status: 400, body: { ok: false, error: { code: 'INVALID_REQUEST', message: 'too long' } } });
  });
});

describe('handleClose__Aggregate__', () => {
  it('成功は 200 と { ok, item }', async () => {
    const response = await handleClose__Aggregate__(stub<Close__Aggregate__UseCase>(vi.fn().mockResolvedValue(ok(VIEW))), 'a-1');
    expect(response).toEqual({ status: 200, body: { ok: true, item: VIEW } });
  });

  it('id が文字列でなければ 400 VALIDATION_FAILED と id', async () => {
    const response = await handleClose__Aggregate__(stub<Close__Aggregate__UseCase>(vi.fn()), undefined);
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED', details: ['id'] } });
  });

  it.each<[AppErrorKind, AppError, number, string]>([
    ['invalid', invalid('x'), 400, 'INVALID_REQUEST'],
    ['unauthorized', unauthorized('x'), 401, 'UNAUTHORIZED'],
    ['not_found', notFound('x'), 404, 'NOT_FOUND'],
    ['conflict', conflict('x'), 409, 'CONFLICT'],
    ['unprocessable', unprocessable('x'), 422, 'UNPROCESSABLE'],
    ['unavailable', unavailable('x'), 503, 'UNAVAILABLE'],
  ])('失敗 %s は status %i・code %s', async (_kind, error, status, code) => {
    const response = await handleClose__Aggregate__(stub<Close__Aggregate__UseCase>(vi.fn().mockResolvedValue(err(error))), 'a-1');
    expect(response).toEqual({ status, body: { ok: false, error: { code, message: 'x' } } });
  });
});
