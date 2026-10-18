import { describe, expect, it } from 'vitest';
import { AppError, conflict, invalid, notFound, unauthorized, unavailable, unprocessable, type AppErrorKind } from './app-error.js';

describe('AppError の生成関数', () => {
  it.each<[AppErrorKind, AppError]>([
    ['unauthorized', unauthorized('m')],
    ['invalid', invalid('m')],
    ['not_found', notFound('m')],
    ['conflict', conflict('m')],
    ['unprocessable', unprocessable('m')],
    ['unavailable', unavailable('m')],
  ])('%s は kind と message を持つ', (kind, error) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error.kind).toBe(kind);
    expect(error.message).toBe('m');
  });

  it('detail を運べる。渡さなければ undefined', () => {
    expect(invalid('m', ['name']).detail).toEqual(['name']);
    expect(invalid('m').detail).toBeUndefined();
  });
});
