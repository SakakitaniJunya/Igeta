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

describe('AppError の生成関数', () => {
  it.each<[AppErrorKind, (message: string) => AppError]>([
    ['unauthorized', unauthorized],
    ['invalid', invalid],
    ['not_found', notFound],
    ['conflict', conflict],
    ['unprocessable', unprocessable],
    ['unavailable', unavailable],
  ])('%s の kind と message を持つ', (kind, create) => {
    const error = create('理由');
    expect(error).toBeInstanceOf(AppError);
    expect(error.kind).toBe(kind);
    expect(error.message).toBe('理由');
  });

  it('detail を渡すと持つ', () => {
    expect(invalid('x', ['name']).detail).toEqual(['name']);
  });
});
