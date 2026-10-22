import { describe, expect, it } from 'vitest';
import { AppError, conflict, invalid, notFound, unauthorized, unavailable, unprocessable } from './app-error';

describe('AppError', () => {
  it('TST-101 invalid に message と detail を渡すとき kind・message・detail を読める', () => {
    const error = invalid('m', ['name']);

    expect(error.kind).toBe('invalid');
    expect(error.message).toBe('m');
    expect(error.detail).toEqual(['name']);
  });

  it('TST-101 detail を省くとき detail は undefined', () => {
    const error = invalid('m');

    expect(error.detail).toBeUndefined();
  });

  it.each([
    ['invalid', invalid],
    ['unauthorized', unauthorized],
    ['not_found', notFound],
    ['conflict', conflict],
    ['unprocessable', unprocessable],
    ['unavailable', unavailable],
  ] as const)('TST-102 %s の生成関数は kind が一致する AppError を返す', (kind, create) => {
    const error = create('m');

    expect(error).toBeInstanceOf(AppError);
    expect(error.kind).toBe(kind);
  });
});
