// controller のテスト。usecase は execute だけを持つ偽物にし、状態と本文の対応だけを確かめる。

import { describe, expect, it, vi } from 'vitest';
import {
  conflict,
  invalid,
  notFound,
  unauthorized,
  unavailable,
  unprocessable,
  type AppError,
  type AppErrorKind,
} from '@/shared/domain/app-error.js';
import { err, ok } from '@/shared/domain/result.js';
import { __Aggregate__Controller } from '@/modules/__context__/presentation/__aggregate__.controller.js';

const VIEW = { id: 'a-1', name: '名前', status: 'open' } as const;

function build(overrides: { list?: unknown; create?: unknown; close?: unknown } = {}) {
  const list = vi.fn().mockResolvedValue(ok({ items: [VIEW], truncated: false }));
  const create = vi.fn().mockResolvedValue(ok(VIEW));
  const close = vi.fn().mockResolvedValue(ok({ ...VIEW, status: 'closed' }));
  const useCases = {
    list: { execute: overrides.list ?? list },
    create: { execute: overrides.create ?? create },
    close: { execute: overrides.close ?? close },
  } as unknown as ConstructorParameters<typeof __Aggregate__Controller>[0];
  return { controller: new __Aggregate__Controller(useCases), list, create, close };
}

const KINDS: ReadonlyArray<[AppErrorKind, AppError, number, string]> = [
  ['unauthorized', unauthorized('m'), 401, 'UNAUTHORIZED'],
  ['invalid', invalid('m'), 400, 'INVALID_REQUEST'],
  ['not_found', notFound('m'), 404, 'NOT_FOUND'],
  ['conflict', conflict('m'), 409, 'CONFLICT'],
  ['unprocessable', unprocessable('m'), 422, 'UNPROCESSABLE'],
  ['unavailable', unavailable('m'), 503, 'UNAVAILABLE'],
];

describe('__Aggregate__Controller.list', () => {
  it('成功は 200 と {ok,items,truncated}。status を usecase へ渡す', async () => {
    const { controller, list } = build();
    const response = await controller.list({ status: 'open' });
    expect(response).toEqual({ status: 200, body: { ok: true, items: [VIEW], truncated: false } });
    expect(list).toHaveBeenCalledWith({ status: 'open' });
  });

  it('形の違う query は 400 VALIDATION_FAILED と項目名で、usecase を呼ばない', async () => {
    const { controller, list } = build();
    const response = await controller.list({ status: 'done' });
    expect(response).toEqual({
      status: 400,
      body: { ok: false, error: { code: 'VALIDATION_FAILED', message: 'request validation failed', details: ['status'] } },
    });
    expect(list).not.toHaveBeenCalled();
  });

  it.each(KINDS)('%s の失敗は kind に応じた応答', async (_kind, error, status, code) => {
    const { controller } = build({ list: vi.fn().mockResolvedValue(err(error)) });
    const response = await controller.list({});
    expect([response.status, (response.body as { error: { code: string } }).error.code]).toEqual([status, code]);
  });
});

describe('__Aggregate__Controller.create', () => {
  it('成功は 201 と {ok,item}。name を usecase へ渡す', async () => {
    const { controller, create } = build();
    const response = await controller.create({ name: '名前' });
    expect(response).toEqual({ status: 201, body: { ok: true, item: VIEW } });
    expect(create).toHaveBeenCalledWith({ name: '名前' });
  });

  it.each([undefined, {}, { name: 1 }, { name: 'x', extra: true }])('形の違う本文は 400 VALIDATION_FAILED (%j)', async (body) => {
    const { controller, create } = build();
    const response = await controller.create(body);
    expect(response.status).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
    expect(create).not.toHaveBeenCalled();
  });

  it.each(KINDS)('%s の失敗は kind に応じた応答', async (_kind, error, status, code) => {
    const { controller } = build({ create: vi.fn().mockResolvedValue(err(error)) });
    const response = await controller.create({ name: 'x' });
    expect([response.status, (response.body as { error: { code: string } }).error.code]).toEqual([status, code]);
  });
});

describe('__Aggregate__Controller.close', () => {
  it('成功は 200 と {ok,item}。id を usecase へ渡す', async () => {
    const { controller, close } = build();
    const response = await controller.close('a-1');
    expect(response).toEqual({ status: 200, body: { ok: true, item: { ...VIEW, status: 'closed' } } });
    expect(close).toHaveBeenCalledWith({ id: 'a-1' });
  });

  it.each([undefined, '', 5])('文字列でない・空の id は id の 400 VALIDATION_FAILED (%j)', async (id) => {
    const { controller, close } = build();
    const response = await controller.close(id);
    expect(response.body).toEqual({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'request validation failed', details: ['id'] },
    });
    expect(close).not.toHaveBeenCalled();
  });

  it.each(KINDS)('%s の失敗は kind に応じた応答', async (_kind, error, status, code) => {
    const { controller } = build({ close: vi.fn().mockResolvedValue(err(error)) });
    const response = await controller.close('a-1');
    expect([response.status, (response.body as { error: { code: string } }).error.code]).toEqual([status, code]);
  });
});
