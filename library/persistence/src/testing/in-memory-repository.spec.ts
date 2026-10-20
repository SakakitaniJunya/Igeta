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

// JSON.parse は any を返す。保存先から来た「型に合わない生の値」を再現するために使う
const MALFORMED_RECORDS: Readonly<Record<string, MemoRecord>> = {
  'title-too-long': { title: TITLE_TOO_LONG, state: 'draft' },
  'title-not-string': JSON.parse('{"title":42,"state":"draft"}'),
  'state-invalid': { title: '最初', state: 'archived' },
};

function createInMemoryMemoSubject(): ContractSubject<Memo, MemoFilter> {
  const store = new InMemoryStore<MemoRecord>();
  const repository = new InMemoryRepository({ store, mapper: memoMapper, filterFields: memoFilterFields });
  const idGenerator = createUuidGenerator();
  const plant = async (kind: string, id: string): Promise<void> => {
    const record = MALFORMED_RECORDS[kind];
    if (record === undefined) throw new Error(`知らない種類: ${kind}`);

    await store.putRaw(id, record);
  };

  return {
    repository,
    runner: new InMemoryTransactionRunner(store),
    newId: () => idGenerator.next(),
    malformed: { plant, remove: (id) => store.remove(id) },
  };
}

describeRepositoryContract({
  name: 'memos (InMemory)',
  setup: createInMemoryMemoSubject,
  malformedKinds: Object.keys(MALFORMED_RECORDS),
  fixtures: { createEntity: createMemo, filterByState: createMemoFilter, isSameContent: isSameMemoContent },
});

describe('InMemory の保存先', () => {
  it('TST-301 putRaw で置いた壊れた record は Mapper を通さず保存される', async () => {
    const store = new InMemoryStore<MemoRecord>();

    await store.putRaw('raw-1', { title: TITLE_TOO_LONG, state: 'draft' });

    expect(store.read('raw-1')).toEqual({ title: TITLE_TOO_LONG, state: 'draft' });
  });

  it('TST-301 remove で消した record は読めなくなる', async () => {
    const store = new InMemoryStore<MemoRecord>();
    await store.putRaw('raw-1', { title: TITLE_TOO_LONG, state: 'draft' });

    await store.remove('raw-1');

    expect(store.read('raw-1')).toBeUndefined();
  });
});
