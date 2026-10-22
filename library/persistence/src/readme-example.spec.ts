// README の「使い方」と「契約テスト」のコードと同じ手順を流す。import の path だけが README と違う
import { describe, expect, it } from 'vitest';
import { createUuidGenerator, err, ok, unprocessable } from './index';
import type { Mapper } from './index';
import {
  describeRepositoryContract,
  InMemoryRepository,
  InMemoryStore,
  InMemoryTransactionRunner,
} from '#testing/index';

interface Memo { readonly id: string; readonly title: string; readonly state: 'draft' | 'published' }
interface MemoRecord { readonly title: string; readonly state: string }

const MAX_TITLE_LENGTH = 40;

const memoMapper: Mapper<Memo, MemoRecord> = {
  toRecord: ({ title, state }) => ({ title, state }),
  fromRecord: (id, { title, state }) =>
    typeof title === 'string' && title.length <= MAX_TITLE_LENGTH && (state === 'draft' || state === 'published')
      ? ok({ id, title, state })
      : err(unprocessable('memo が不正')),
};

describe('README の例', () => {
  const store = new InMemoryStore<MemoRecord>();
  const memos = new InMemoryRepository({
    store,
    mapper: memoMapper,
    filterFields: (filter: { state?: Memo['state'] }) => ({ state: filter.state }),
  });
  const runner = new InMemoryTransactionRunner(store);

  it('TST-307 README の使い方のとおり保存して list すると 1 件が返り、続きは無い', async () => {
    await runner.run((scope) => memos.save({ id: 'm-1', title: 'はじめ', state: 'draft' }, scope));

    const page = await memos.list({ filter: { state: 'draft' }, limit: 20 });

    expect(page.items).toEqual([{ id: 'm-1', title: 'はじめ', state: 'draft' }]);
    expect(page.isTruncated).toBe(false);
  });

  const idGenerator = createUuidGenerator();

  describeRepositoryContract({
    name: 'memos (README の InMemory)',
    setup: () => ({ repository: memos, runner, newId: () => idGenerator.next(), remove: (id) => store.remove(id) }),
    malformedKinds: [],
    fixtures: {
      createEntity: (id, state) => ({ id, title: state === 'draft' ? '下書き' : '公開', state }),
      filterByState: (state) => ({ state }),
      isSameContent: (left, right) => left.title === right.title && left.state === right.state,
    },
  });
});
