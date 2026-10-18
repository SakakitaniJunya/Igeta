import { describe, expect, it } from 'vitest';
import { AppError } from '@/shared/domain/app-error.js';
import { __Aggregate__AlreadyClosedError } from '@/modules/__context__/domain/errors/__aggregate__-already-closed.error.js';

describe('__Aggregate__AlreadyClosedError', () => {
  it('kind は conflict で、message と id を持つ', () => {
    const error = new __Aggregate__AlreadyClosedError('a-1');
    expect(error).toBeInstanceOf(AppError);
    expect(error.kind).toBe('conflict');
    expect(error.message).toBe('__aggregate__ already closed');
    expect(error.id).toBe('a-1');
  });
});
