import { describe, expect, it } from 'vitest';
import { assertMalformedPlanter } from './describe-repository-contract';
import type { ContractSubject } from './types';
import type { Memo, MemoFilter } from '#testing/fixtures/memo';

describe('describeRepositoryContract の検査', () => {
  const subjectWithoutPlanter: ContractSubject<Memo, MemoFilter> = {
    repository: {
      findById: async () => undefined,
      list: async () => ({ items: [], isTruncated: false }),
      save: async () => {},
    },
    runner: { run: (work) => work({ kind: 'transaction-scope' }) },
    newId: () => 'id-1',
    remove: async () => {},
  };

  it('TST-210 壊れたデータの種類があるのに置く関数がないとき Error を投げる', () => {
    const checkWithKinds = () => assertMalformedPlanter(subjectWithoutPlanter, ['title-too-long']);

    expect(checkWithKinds).toThrow('plantMalformed');
  });

  it('TST-210 壊れたデータの種類が空のとき置く関数がなくても投げない', () => {
    const checkWithoutKinds = () => assertMalformedPlanter(subjectWithoutPlanter, []);

    expect(checkWithoutKinds).not.toThrow();
  });
});
