import { describe, expect, it } from 'vitest';
import { notFound } from '@/shared/domain/app-error.js';
import { err, ok } from '@/shared/domain/result.js';

describe('ok / err', () => {
  it('ok は値を持ち、ok が true', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
  });

  it('err はエラーを持ち、ok が false', () => {
    const error = notFound('x');
    expect(err(error)).toEqual({ ok: false, error });
  });

  it('ok の真偽で値とエラーを判別できる', () => {
    const results = [ok('v'), err(notFound('x'))];
    expect(results.map((result) => (result.ok ? result.value : result.error.message))).toEqual(['v', 'x']);
  });
});
