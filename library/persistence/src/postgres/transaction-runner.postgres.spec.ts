import { afterAll, beforeAll, expect, it } from 'vitest';
import { AppError } from '../core/app-error';
import { captureThrown } from '../testing/capture-thrown';
import { createMemo } from '../testing/memo-fixture';
import { describePostgres } from '../testing/postgres-harness';
import { createMemoTables, createPostgresMemoParts, dropMemoTables } from './postgres-memo-parts';

// 全員が到着するまで待つ。2 つの Transaction が、両方読み終えてから書くようにそろえる
function createBarrier(parties: number): () => Promise<void> {
  const releases: (() => void)[] = [];

  return () =>
    new Promise<void>((resolve) => {
      releases.push(resolve);
      if (releases.length === parties) releases.forEach((release) => release());
    });
}

describePostgres('SqlTransactionRunner (Postgres 16)', () => {
  const { db, repository, runner } = createPostgresMemoParts();
  const memoId = 'memo-conflict';

  beforeAll(() => createMemoTables(db));
  afterAll(async () => {
    await dropMemoTables(db);
    await db.destroy();
  });

  it('TST-709 同じ行を 2 つの Transaction が競合して更新するとき 1 つは競合のエラーで失敗し、更新は 1 つだけ残る', async () => {
    await repository.save(createMemo(memoId, 'draft'));
    const bothHaveRead = createBarrier(2);
    const appendToTitle = (suffix: string) =>
      runner.run(async (scope) => {
        const current = await repository.findById(memoId, scope);
        if (current === undefined) throw new Error('保存した memo が読めない');
        await bothHaveRead();
        await repository.save({ ...current, title: `${current.title}${suffix}` }, scope);
      });

    const outcomes = await Promise.allSettled([appendToTitle('a'), appendToTitle('b')]);
    const updated = await repository.findById(memoId);

    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).not.toBeInstanceOf(AppError);
    expect(updated?.title).toHaveLength('下書き'.length + 1);
  });

  it('TST-711 work が ECONNRESET 付きの Error を投げたとき unavailable に翻訳されず、そのまま届く', async () => {
    const fromWork = Object.assign(new Error('work の失敗'), { code: 'ECONNRESET' });
    const failInsideWork = async (): Promise<void> => {
      throw fromWork;
    };

    const thrown = await captureThrown(() => runner.run(failInsideWork));

    expect(thrown).toBe(fromWork);
  });
});
