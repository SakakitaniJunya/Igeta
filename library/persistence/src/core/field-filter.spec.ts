import { describe, expect, it } from 'vitest';
import { matchesFieldFilter } from './field-filter';

describe('field-filter', () => {
  const draftRecord = { title: '下書き', state: 'draft' };

  it('TST-110 全項目が一致するとき true を返す', () => {
    const isMatched = matchesFieldFilter(draftRecord, { state: 'draft' });

    expect(isMatched).toBe(true);
  });

  it('TST-110 1 項目でも違うとき false を返す', () => {
    const isMatched = matchesFieldFilter(draftRecord, { state: 'draft', title: '別' });

    expect(isMatched).toBe(false);
  });

  it('TST-110 filter が空のとき true を返す', () => {
    const isMatched = matchesFieldFilter(draftRecord, {});

    expect(isMatched).toBe(true);
  });

  it('TST-110 値が undefined の項目は絞らない', () => {
    const isMatched = matchesFieldFilter(draftRecord, { state: undefined });

    expect(isMatched).toBe(true);
  });
});
