import { describe, expect, it } from 'vitest';
import { TenantId } from '@/shared/kernel/tenant-id';
import { __Aggregate__ } from '@/modules/__context__/domain/__aggregate__';
import { __Aggregate__Id } from '@/modules/__context__/domain/value-objects/__aggregate__-id';

const tenant = (): TenantId => {
  const result = TenantId.create('tenant-001');
  if (!result.ok) throw new Error('fixture invalid');
  return result.value;
};

const id = (): __Aggregate__Id => {
  const result = __Aggregate__Id.create('01hq2m9k3v');
  if (!result.ok) throw new Error('fixture invalid');
  return result.value;
};

describe('__Aggregate__', () => {
  it('生成すると draft で、作成イベントを 1 件持つ', () => {
    const aggregate = __Aggregate__.create(id(), tenant(), new Date('2026-09-16T00:00:00Z'));
    expect(aggregate.status).toBe('draft');
    expect(aggregate.pullEvents()).toHaveLength(1);
  });

  it('イベントは 1 度しか取り出せない', () => {
    const aggregate = __Aggregate__.create(id(), tenant(), new Date());
    aggregate.pullEvents();
    expect(aggregate.pullEvents()).toHaveLength(0);
  });

  it('許可された遷移だけ通る', () => {
    const aggregate = __Aggregate__.create(id(), tenant(), new Date());
    expect(aggregate.transitionTo('confirmed').ok).toBe(true);
    const back = aggregate.transitionTo('draft');
    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.error.code).toBe('__AGGREGATE___TRANSITION_FORBIDDEN');
  });
});
