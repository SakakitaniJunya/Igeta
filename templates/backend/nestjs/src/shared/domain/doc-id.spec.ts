import { describe, expect, it } from 'vitest';
import { assertValidDocIdSegment, InvalidDocIdSegment, isValidDocIdSegment } from '@/shared/domain/doc-id.js';

describe('isValidDocIdSegment', () => {
  it.each(['a', 'a-1', 'A_b-9', 'x'.repeat(64)])('通る (%s)', (value) => {
    expect(isValidDocIdSegment(value)).toBe(true);
  });

  it.each(['', 'a/b', '../x', '.', '..', 'a b', 'x'.repeat(65)])('通らない (%j)', (value) => {
    expect(isValidDocIdSegment(value)).toBe(false);
  });
});

describe('assertValidDocIdSegment', () => {
  it('不正なら生値を含まないメッセージで投げる', () => {
    expect(() => assertValidDocIdSegment('a/secret')).toThrow(InvalidDocIdSegment);
    expect(() => assertValidDocIdSegment('a/secret')).not.toThrow(/secret/);
  });

  it('正しければ投げない', () => {
    expect(() => assertValidDocIdSegment('a-1')).not.toThrow();
  });
});
