import { describe, expect, it } from 'vitest';
import { createUuidGenerator } from '../core/id-generator';
import type { ContractSubject } from './contract-types';
import { describeRepositoryContract } from './describe-repository-contract';
import { createInMemoryParts } from './in-memory-memo-parts';
import type { InMemoryParts } from './in-memory-memo-parts';
import { createMemo, createMemoFilter, isSameMemoContent } from './memo-fixture';
import type { Memo, MemoFilter, MemoRecord } from './memo-fixture';

const TITLE_TOO_LONG = 'あ'.repeat(41);

// 保存先から来た「型に合わない生の値」を再現する。JSON.parse は any を返すので、型付きの関数に閉じ込める
function parseRecord(json: string): MemoRecord {
  return JSON.parse(json);
}

const MALFORMED_RECORDS: Readonly<Record<string, MemoRecord>> = {
  'title-too-long': { title: TITLE_TOO_LONG, state: 'draft' },
  'title-not-string': parseRecord('{"title":42,"state":"draft"}'),
  'state-invalid': { title: '下書き', state: 'archived' },
};

function createInMemoryMemoSubject(parts: InMemoryParts): ContractSubject<Memo, MemoFilter> {
  const { store, repository, runner } = parts;
  const idGenerator = createUuidGenerator();
  const plantMalformed = async (kind: string, id: string): Promise<void> => {
    const record = MALFORMED_RECORDS[kind];
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
    malformedKinds: Object.keys(MALFORMED_RECORDS),
    fixtures: { createEntity: createMemo, filterByState: createMemoFilter, isSameContent: isSameMemoContent },
  });

  it('TST-305 契約を通し終えたとき保存先に行が残っていない', () => {
    const remainingRows = contractParts.store.sortedRows();

    expect(remainingRows).toEqual([]);
  });
});

describe('InMemory の保存先', () => {
  it('TST-301 putRaw で置いた壊れた record は Mapper を通さず保存される', async () => {
    const { store } = createInMemoryParts();

    await store.putRaw('raw-1', { title: TITLE_TOO_LONG, state: 'draft' });

    expect(store.read('raw-1')).toEqual({ title: TITLE_TOO_LONG, state: 'draft' });
  });

  it('TST-301 remove で消した record は読めなくなる', async () => {
    const { store } = createInMemoryParts();
    await store.putRaw('raw-1', { title: TITLE_TOO_LONG, state: 'draft' });

    await store.remove('raw-1');

    expect(store.read('raw-1')).toBeUndefined();
  });
});
