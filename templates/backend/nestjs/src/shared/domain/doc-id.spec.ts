import { describe, expect, it } from 'vitest';
import { assertValidDocIdSegment, InvalidDocIdSegment, isValidDocIdSegment } from './doc-id.js';

describe('isValidDocIdSegment', () => {
  it.each(['a', 'A-1_b', 'x'.repeat(64), '0f8fad5b-d9cb-469f-a165-70867728950e'])('通す (%s)', (value) => {
    expect(isValidDocIdSegment(value)).toBe(true);
  });

  it.each(['', 'a/b', '../x', '.', '..', 'a b', 'x'.repeat(65), 'あ'])('落とす (%j)', (value) => {
    expect(isValidDocIdSegment(value)).toBe(false);
  });
});

describe('assertValidDocIdSegment', () => {
  it('正しければ何も起きない', () => {
    expect(() => assertValidDocIdSegment('ok-1')).not.toThrow();
  });

  it('不正なら投げ、生の値をメッセージに残さない', () => {
    expect(() => assertValidDocIdSegment('a/secret')).toThrow(InvalidDocIdSegment);
    expect(() => assertValidDocIdSegment('a/secret')).not.toThrow(/secret/);
  });
});
