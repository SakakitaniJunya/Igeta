import { describe, expect, it } from 'vitest';
import { __Aggregate__Id } from '@/modules/__context__/domain/value-objects/__aggregate__-id';

describe('__Aggregate__Id', () => {
  it('形式が正しければ生成できる', () => {
    const result = __Aggregate__Id.create('01hq2m9k3v');
    expect(result.ok).toBe(true);
  });

  it('形式が不正なら DomainError を返す (throw しない)', () => {
    const result = __Aggregate__Id.create('x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('__AGGREGATE___ID_INVALID');
  });
});
