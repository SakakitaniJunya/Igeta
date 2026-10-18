import { describe, expect, it } from 'vitest';
import type { ZodError } from 'zod';
import {
  close__Aggregate__ParamsSchema,
  create__Aggregate__BodySchema,
  detailsOf,
  list__Aggregate__ItemsQuerySchema,
} from './__aggregate__.schemas.js';

function detailsFor(schema: { safeParse: (value: unknown) => { success: boolean; error?: ZodError } }, value: unknown): string[] | null {
  const result = schema.safeParse(value);
  return result.success || result.error === undefined ? null : detailsOf(result.error);
}

describe('create__Aggregate__BodySchema', () => {
  it('name が文字列なら通る (長さは見ない)', () => {
    expect(create__Aggregate__BodySchema.safeParse({ name: '' }).success).toBe(true);
  });

  it('型違い・必須欠け・余計な項目は、その項目名で落ちる', () => {
    expect(detailsFor(create__Aggregate__BodySchema, { name: 1 })).toEqual(['name']);
    expect(detailsFor(create__Aggregate__BodySchema, {})).toEqual(['name']);
    expect(detailsFor(create__Aggregate__BodySchema, { name: 'a', extra: true })).toEqual(['extra']);
  });

  it('本文が無い・オブジェクトでないときは (root)', () => {
    expect(detailsFor(create__Aggregate__BodySchema, undefined)).toEqual(['(root)']);
    expect(detailsFor(create__Aggregate__BodySchema, 'text')).toEqual(['(root)']);
  });

  it('同じ項目名は 1 つにまとめる', () => {
    expect(detailsFor(create__Aggregate__BodySchema, { name: 1, a: 1, b: 2 })).toEqual(['name', 'a', 'b']);
  });
});

describe('close__Aggregate__ParamsSchema', () => {
  it('空でない文字列の id が通る', () => {
    expect(close__Aggregate__ParamsSchema.safeParse({ id: 'a-1' }).success).toBe(true);
  });

  it('空・型違いは id で落ちる', () => {
    expect(detailsFor(close__Aggregate__ParamsSchema, { id: '' })).toEqual(['id']);
    expect(detailsFor(close__Aggregate__ParamsSchema, { id: undefined })).toEqual(['id']);
  });
});

describe('list__Aggregate__ItemsQuerySchema', () => {
  it.each([{}, { status: 'open' }, { status: 'closed' }])('通る (%j)', (query) => {
    expect(list__Aggregate__ItemsQuerySchema.safeParse(query).success).toBe(true);
  });

  it('status は open / closed だけ', () => {
    expect(detailsFor(list__Aggregate__ItemsQuerySchema, { status: 'done' })).toEqual(['status']);
    expect(detailsFor(list__Aggregate__ItemsQuerySchema, { status: '' })).toEqual(['status']);
  });

  it('余計な項目は落ちる', () => {
    expect(detailsFor(list__Aggregate__ItemsQuerySchema, { limit: '5' })).toEqual(['limit']);
  });
});
