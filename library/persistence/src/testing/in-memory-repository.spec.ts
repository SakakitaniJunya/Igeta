import { describe, expect, it } from 'vitest';
import { createUuidGenerator } from '../core/id-generator';
import type { TransactionScope } from '../core/transaction';
import { captureThrown } from './capture-thrown';
import type { ContractSubject } from './contract-types';
import { describeRepositoryContract } from './describe-repository-contract';
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

function createInMemoryParts() {
  const store = new InMemoryStore<MemoRecord>();
  const repository = new InMemoryRepository({ store, mapper: memoMapper, filterFields: memoFilterFields });
  const runner = new InMemoryTransactionRunner(store);

  return { store, repository, runner };
}

const contractParts = createInMemoryParts();

function createInMemoryMemoSubject(): ContractSubject<Memo, MemoFilter> {
  const { store, repository, runner } = contractParts;
  const idGenerator = createUuidGenerator();
  const plantMalformed = async (kind: string, id: string): Promise<void> => {
    const record = MALFORMED_RECORDS[kind];
    if (record === undefined) throw new Error(`知らない種類: ${kind}`);

    await store.putRaw(id, record);
  };

  return { repository, runner, newId: () => idGenerator.next(), remove: (id) => store.remove(id), plantMalformed };
}

describeRepositoryContract({
  name: 'memos (InMemory)',
  setup: createInMemoryMemoSubject,
  malformedKinds: Object.keys(MALFORMED_RECORDS),
  fixtures: { createEntity: createMemo, filterByState: createMemoFilter, isSameContent: isSameMemoContent },
});

describe('InMemory の保存先', () => {
  it('TST-305 契約を通し終えたとき保存先に行が残っていない', () => {
    const remainingRows = contractParts.store.sortedRows();

    expect(remainingRows).toEqual([]);
  });

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

describe('InMemory の Transaction', () => {
  it('TST-302 開始が重なる 2 つの Transaction がどちらも commit したとき両方の書き込みが残る', async () => {
    const { repository, runner } = createInMemoryParts();
    const saveSecondInside = () => runner.run((scope) => repository.save(createMemo('memo-b', 'second'), scope));

    await runner.run(async (scope) => {
      const secondTransaction = saveSecondInside();
      await repository.save(createMemo('memo-a', 'first'), scope);
      await secondTransaction;
    });

    const foundA = await repository.findById('memo-a');
    const foundB = await repository.findById('memo-b');
    expect(foundA).toEqual(createMemo('memo-a', 'first'));
    expect(foundB).toEqual(createMemo('memo-b', 'second'));
  });

  it('TST-303 Transaction の実行中に外で別の id を保存したとき commit 後も外の行が残る', async () => {
    const { repository, runner } = createInMemoryParts();

    await runner.run(async (scope) => {
      await repository.save(createMemo('memo-inside', 'first'), scope);
      await repository.save(createMemo('memo-outside', 'second'));
    });

    const foundOutside = await repository.findById('memo-outside');
    expect(foundOutside).toEqual(createMemo('memo-outside', 'second'));
  });

  it('TST-304 commit 済みの Transaction の scope で保存したとき Error を投げる', async () => {
    const { repository, runner } = createInMemoryParts();
    const endedScope = await runner.run(async (scope) => scope);

    const saveWithEndedScope = () => repository.save(createMemo('memo-late', 'first'), endedScope);

    const thrown = await captureThrown(saveWithEndedScope);
    expect(thrown).toBeInstanceOf(Error);
  });

  it('TST-304 rollback 済みの Transaction の scope で保存したとき Error を投げる', async () => {
    const { repository, runner } = createInMemoryParts();
    const scopes: TransactionScope[] = [];
    await captureThrown(() =>
      runner.run(async (scope) => {
        scopes.push(scope);
        throw new Error('boom');
      }),
    );
    const [endedScope] = scopes;

    const saveWithEndedScope = () => repository.save(createMemo('memo-late', 'first'), endedScope);

    const thrown = await captureThrown(saveWithEndedScope);
    expect(thrown).toBeInstanceOf(Error);
  });
});
