import { describe, expect, it } from 'vitest';
import { __Aggregate__AlreadyClosedError } from './__aggregate__-already-closed.error.js';

describe('__Aggregate__AlreadyClosedError', () => {
  it('Error で、name・message・id を持つ', () => {
    const error = new __Aggregate__AlreadyClosedError('a-1');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('__Aggregate__AlreadyClosedError');
    expect(error.message).toBe('__aggregate__ already closed');
    expect(error.id).toBe('a-1');
  });
});
