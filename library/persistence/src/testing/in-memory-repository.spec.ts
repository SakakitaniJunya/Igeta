import { describe, expect, it } from 'vitest';
import { createUuidGenerator } from '../core/id-generator';
import { describeRepositoryContract } from './describe-repository-contract';
import type { ContractSubject } from './contract-types';
import { InMemoryRepository } from './in-memory-repository';
import { InMemoryStore } from './in-memory-store';
import { InMemoryTransactionRunner } from './in-memory-transaction-runner';
import { createMemo, createMemoFilter, isSameMemoContent, memoFilterFields, memoMapper } from './memo-fixture';
import type { Memo, MemoFilter, MemoRecord } from './memo-fixture';

const TITLE_TOO_LONG = 'あ'.repeat(41);

function createInMemoryMemoSubject(): ContractSubject<Memo, MemoFilter> {
  const store = new InMemoryStore<MemoRecord>();
  const repository = new InMemoryRepository({ store, mapper: memoMapper, filterFields: memoFilterFields });
  const idGenerator = createUuidGenerator();

  return {
    repository,
    runner: new InMemoryTransactionRunner(store),
    newId: () => idGenerator.next(),
    malformed: [
      (id) => store.putRaw(id, { title: TITLE_TOO_LONG, state: 'draft' }),
      // JSON.parse は any を返す。保存先から来た「型に合わない生の値」を再現するために使う
      (id) => store.putRaw(id, JSON.parse('{"title":42,"state":"draft"}')),
      (id) => store.putRaw(id, { title: '最初', state: 'archived' }),
    ],
  };
}

describeRepositoryContract({
  name: 'memos (InMemory)',
  setup: createInMemoryMemoSubject,
  fixtures: { createEntity: createMemo, filterByState: createMemoFilter, isSameContent: isSameMemoContent },
});

describe('InMemory の保存先', () => {
  it('TST-301 putRaw で置いた壊れた record は Mapper を通さず保存される', async () => {
    const store = new InMemoryStore<MemoRecord>();

    await store.putRaw('raw-1', { title: TITLE_TOO_LONG, state: 'draft' });

    expect(store.read('raw-1')).toEqual({ title: TITLE_TOO_LONG, state: 'draft' });
  });
});
