import { describe, expect, it } from 'vitest';
import { createUuidGenerator } from '#core/identity/id-generator';
import type { ContractSubject } from '#testing/contract/types';
import { describeRepositoryContract } from '#testing/contract/describe-repository-contract';
import { createInMemoryParts } from '#testing/fixtures/in-memory-memo-parts';
import { InMemoryRepository } from './repository';
import type { InMemoryParts } from '#testing/fixtures/in-memory-memo-parts';
import { createMemo, MALFORMED_MEMO_RECORDS, memoContractFixtures, memoMapper } from '#testing/fixtures/memo';
import type { Memo, MemoFilter, MemoRecord } from '#testing/fixtures/memo';

const TITLE_TOO_LONG = 'あ'.repeat(41);

function createInMemoryMemoSubject(parts: InMemoryParts): ContractSubject<Memo, MemoFilter> {
  const { store, repository, runner } = parts;
  const idGenerator = createUuidGenerator();
  const plantMalformed = async (kind: string, id: string): Promise<void> => {
    const record = MALFORMED_MEMO_RECORDS[kind];
    if (record === undefined) throw new Error(`知らない種類: ${kind}`);

    await store.putRaw(id, record);
  };

  return { repository, runner, newId: () => idGenerator.next(), remove: (id) => store.remove(id), plantMalformed };
}

describe('InMemory の契約', () => {
  const contractParts = createInMemoryParts();
  describeRepositoryContract({
    name: 'memos (InMemory)',
    setup: () => createInMemoryMemoSubject(contractParts),
    malformedKinds: Object.keys(MALFORMED_MEMO_RECORDS),
    fixtures: memoContractFixtures,
  });

  it('TST-305 契約を通し終えたとき保存先に行が残っていない', () => {
    const remainingRows = contractParts.store.sortedRows();

    expect(remainingRows).toEqual([]);
  });
});

describe('InMemory の保存先', () => {
  it('TST-301 putRaw で置いた壊れた record は Mapper を通さず保存される', async () => {
    const { store } = createInMemoryParts();

    await store.putRaw('raw-1', { title: TITLE_TOO_LONG, state: 'draft', note: null });

    expect(store.read('raw-1')).toEqual({ title: TITLE_TOO_LONG, state: 'draft', note: null });
  });

  it('TST-301 remove で消した record は読めなくなる', async () => {
    const { store } = createInMemoryParts();
    await store.putRaw('raw-1', { title: TITLE_TOO_LONG, state: 'draft', note: null });

    await store.remove('raw-1');

    expect(store.read('raw-1')).toBeUndefined();
  });

  it('TST-712 filterFields が存在しない項目を返すとき list は 0 件を返す (失敗しない)', async () => {
    const { store } = createInMemoryParts();
    const repository = new InMemoryRepository({ store, mapper: memoMapper, filterFields: () => ({ no_such: 'x' }) });
    await repository.save(createMemo('memo-1', 'draft'));

    const page = await repository.list({ filter: {}, limit: 10 });

    expect(page.items).toEqual([]);
  });
});
