import { describe, expect, it } from 'vitest';
import { toStoredValues } from './stored-values';

describe('stored-values', () => {
  it('TST-120 undefined の項目のとき null にし、他の値はそのまま残す', () => {
    const record = { title: '下書き', note: undefined, count: 0, empty: '' };

    const stored = toStoredValues(record);

    expect(stored).toStrictEqual({ title: '下書き', note: null, count: 0, empty: '' });
  });
});
