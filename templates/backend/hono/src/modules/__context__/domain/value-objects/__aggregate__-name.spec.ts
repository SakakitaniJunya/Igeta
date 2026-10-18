import { describe, expect, it } from 'vitest';
import { __Aggregate__Name } from './__aggregate__-name.js';

describe('__Aggregate__Name.create', () => {
  it('前後の空白を落とす', () => {
    expect(__Aggregate__Name.create('  名前 ').value).toBe('名前');
  });

  it.each(['a', 'x'.repeat(40)])('長さ 1 と 40 は通す (%j)', (value) => {
    expect(__Aggregate__Name.create(value).value).toBe(value);
  });

  it.each(['', '   ', 'x'.repeat(41)])('長さが 1〜40 でなければ RangeError (%j)', (value) => {
    expect(() => __Aggregate__Name.create(value)).toThrow(RangeError);
  });
});

describe('__Aggregate__Name.equals', () => {
  it('値が同じなら等しい', () => {
    expect(__Aggregate__Name.create('a').equals(__Aggregate__Name.create(' a '))).toBe(true);
    expect(__Aggregate__Name.create('a').equals(__Aggregate__Name.create('b'))).toBe(false);
  });
});
