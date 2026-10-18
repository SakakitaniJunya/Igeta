import { describe, expect, it } from 'vitest';
import { invalid } from './app-error.js';
import { err, ok } from './result.js';

describe('Result', () => {
  it('ok は ok:true と値を持つ', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
  });

  it('err は ok:false とエラーを持つ', () => {
    const error = invalid('bad');
    expect(err(error)).toEqual({ ok: false, error });
  });
});
