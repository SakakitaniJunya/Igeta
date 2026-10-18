import { describe, expect, it } from 'vitest';
import {
  close__Aggregate__ParamsSchema,
  create__Aggregate__BodySchema,
  detailsOf,
  list__Aggregate__ItemsQuerySchema,
} from '@/modules/__context__/presentation/__aggregate__.schemas.js';

function failedFields(result: { success: boolean; error?: Parameters<typeof detailsOf>[0] }): string[] | null {
  return result.success || result.error === undefined ? null : detailsOf(result.error);
}

describe('create__Aggregate__BodySchema', () => {
  it('name が文字列なら通る', () => {
    expect(create__Aggregate__BodySchema.safeParse({ name: '名前' }).success).toBe(true);
  });

  it('空文字は形としては通る (長さは domain が見る)', () => {
    expect(create__Aggregate__BodySchema.safeParse({ name: '' }).success).toBe(true);
  });

  it('型違いは name で落ちる', () => {
    expect(failedFields(create__Aggregate__BodySchema.safeParse({ name: 5 }))).toEqual(['name']);
  });

  it('必須欠けは name で落ちる', () => {
    expect(failedFields(create__Aggregate__BodySchema.safeParse({}))).toEqual(['name']);
  });

  it('余計な項目はその項目名で落ちる', () => {
    expect(failedFields(create__Aggregate__BodySchema.safeParse({ name: 'x', extra: 1 }))).toEqual(['extra']);
  });

  it('オブジェクトでない本文は (root) で落ちる', () => {
    expect(failedFields(create__Aggregate__BodySchema.safeParse('x'))).toEqual(['(root)']);
    expect(failedFields(create__Aggregate__BodySchema.safeParse(undefined))).toEqual(['(root)']);
  });
});

describe('close__Aggregate__ParamsSchema', () => {
  it('空でない id は通る', () => {
    expect(close__Aggregate__ParamsSchema.safeParse({ id: 'a-1' }).success).toBe(true);
  });

  it.each([{ id: '' }, { id: 1 }, {}])('空・型違い・欠けは id で落ちる (%j)', (value) => {
    expect(failedFields(close__Aggregate__ParamsSchema.safeParse(value))).toEqual(['id']);
  });
});

describe('list__Aggregate__ItemsQuerySchema', () => {
  it.each([{}, { status: 'open' }, { status: 'closed' }])('省略か open / closed は通る (%j)', (value) => {
    expect(list__Aggregate__ItemsQuerySchema.safeParse(value).success).toBe(true);
  });

  it.each([{ status: 'done' }, { status: ['open', 'closed'] }])('status の値違いは status で落ちる (%j)', (value) => {
    expect(failedFields(list__Aggregate__ItemsQuerySchema.safeParse(value))).toEqual(['status']);
  });

  it('余計な query は項目名で落ちる', () => {
    expect(failedFields(list__Aggregate__ItemsQuerySchema.safeParse({ page: '2' }))).toEqual(['page']);
  });
});
