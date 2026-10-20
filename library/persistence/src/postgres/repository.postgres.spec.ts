import { afterAll, beforeAll, expect, it } from 'vitest';
import { AppError } from '../core/app-error';
import { InMemoryStore } from '../testing/in-memory-store';
import { captureThrown } from '../testing/capture-thrown';
import { createMemo } from '../testing/memo-fixture';
import { describePostgres } from '../testing/postgres-harness';
import {
  createBoundaryRepository,
  createMemoTables,
  createPostgresMemoParts,
  dropMemoTables,
} from './postgres-memo-parts';

const PAGE_LIMIT = 3;
const ORDERED_IDS = ['a-B', 'a1', 'a_0', 'A0'];

describePostgres('SqlRepository の境界 (Postgres 16)', () => {
  const parts = createPostgresMemoParts();
  const { db, repository } = parts;

  beforeAll(() => createMemoTables(db));
  afterAll(async () => {
    await dropMemoTables(db);
    await db.destroy();
  });

  it('TST-502 id が a-B・a1・a_0・A0 のとき list の並びは JS の sort() と同じ', async () => {
    for (const id of ORDERED_IDS) await repository.save(createMemo(id, 'draft'));

    const page = await repository.list({ limit: 1000 });

    const listedOwnIds = page.items.map((item) => item.id).filter((id) => ORDERED_IDS.includes(id));
    expect(listedOwnIds).toEqual(['A0', 'a-B', 'a1', 'a_0']);
  });

  it('TST-704 limit ちょうどの件数だけ保存したとき list は 3 件で isTruncated false を返す', async () => {
    const boundary = createBoundaryRepository(db);
    for (const index of [1, 2, PAGE_LIMIT]) await boundary.save(createMemo(`boundary-${index}`, 'draft'));

    const page = await boundary.list({ limit: PAGE_LIMIT });

    expect(page.items).toHaveLength(PAGE_LIMIT);
    expect(page.isTruncated).toBe(false);
  });

  it('TST-703 別の実装 (InMemory) の scope を save に渡したとき普通の Error を投げる', async () => {
    const store = new InMemoryStore<string>();
    const foreignScope = await store.runInTransaction(async (scope) => scope);

    const thrown = await captureThrown(() => repository.save(createMemo('memo-foreign', 'draft'), foreignScope));

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(AppError);
  });

  it('TST-707 filterFields が存在しない列名を返すとき list は普通の Error を上げる', async () => {
    const badFilter = createPostgresMemoParts(process.env['PG_URL'] ?? '', () => ({ no_such: 'x' }));

    const thrown = await captureThrown(() => badFilter.repository.list({ filter: {}, limit: 1 }));

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(AppError);
    await badFilter.db.destroy();
  });

  it('TST-708 Transaction の中で書いた後に読むとき Postgres では成功し、書いた内容が読める', async () => {
    const id = 'memo-write-then-read';
    const writeThenRead = async (scope: Parameters<typeof repository.save>[1]) => {
      await repository.save(createMemo(id, 'draft'), scope);
      return repository.findById(id, scope);
    };

    const readInside = await parts.runner.run(writeThenRead);

    expect(readInside).toEqual(createMemo(id, 'draft'));
  });
});
