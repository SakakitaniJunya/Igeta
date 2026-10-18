import { describe, expect, it } from 'vitest';
import { __Aggregate__Name } from '@/modules/__context__/domain/value-objects/__aggregate__-name.js';

describe('__Aggregate__Name.create', () => {
  it('前後の空白を落とす', () => {
    expect(__Aggregate__Name.create('  名前 ').value).toBe('名前');
  });

  it.each(['a', 'x'.repeat(40)])('1 文字と 40 文字は作れる (%#)', (value) => {
    expect(__Aggregate__Name.create(value).value).toBe(value);
  });

  it.each(['', '   ', 'x'.repeat(41)])('0 文字・空白だけ・41 文字は RangeError (%j)', (value) => {
    expect(() => __Aggregate__Name.create(value)).toThrow(RangeError);
  });

  it('equals は値で比べる', () => {
    expect(__Aggregate__Name.create('a').equals(__Aggregate__Name.create(' a '))).toBe(true);
    expect(__Aggregate__Name.create('a').equals(__Aggregate__Name.create('b'))).toBe(false);
  });
});
