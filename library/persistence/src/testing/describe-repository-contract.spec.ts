import { describe, expect, it } from 'vitest';
import { assertMalformedPlanter } from './describe-repository-contract';
import type { ContractSubject } from './contract-types';
import type { Memo, MemoFilter } from './memo-fixture';

describe('describeRepositoryContract の登録', () => {
  const subjectWithoutPlanter: ContractSubject<Memo, MemoFilter> = {
    repository: {
      findById: async () => undefined,
      list: async () => ({ items: [], isTruncated: false }),
      save: async () => {},
    },
    runner: { run: (work) => work({ kind: 'transaction-scope' }) },
    newId: () => 'id-1',
  };

  it('TST-210 壊れたデータの種類があるのに置く関数がないとき登録時に Error を投げる', () => {
    const registerWithKinds = () => assertMalformedPlanter(subjectWithoutPlanter, ['title-too-long']);

    expect(registerWithKinds).toThrow('malformed');
  });

  it('TST-210 壊れたデータの種類が空のとき置く関数がなくても投げない', () => {
    const registerWithoutKinds = () => assertMalformedPlanter(subjectWithoutPlanter, []);

    expect(registerWithoutKinds).not.toThrow();
  });
});
