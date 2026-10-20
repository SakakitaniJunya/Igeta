import { describe, expect, it } from 'vitest';
import type { TransactionScope } from '../core/transaction';
import { captureThrown } from './capture-thrown';
import { createInMemoryParts } from './in-memory-memo-parts';
import type { InMemoryTransactionRunner } from './in-memory-transaction-runner';
import { createMemo } from './memo-fixture';
import type { MemoRecord } from './memo-fixture';

async function captureScopeOfFailedTransaction(
  runner: InMemoryTransactionRunner<MemoRecord>,
): Promise<TransactionScope> {
  const scopes: TransactionScope[] = [];
  const failAfterRecordingScope = async (scope: TransactionScope): Promise<void> => {
    scopes.push(scope);
    throw new Error('boom');
  };

  await captureThrown(() => runner.run(failAfterRecordingScope));
  const [scope] = scopes;
  if (scope === undefined) throw new Error('rollback した Transaction の scope が取れなかった (work が実行されていない)');

  return scope;
}

describe('InMemory の Transaction', () => {
  it('TST-302 開始が重なる 2 つの Transaction がどちらも commit したとき両方の書き込みが残る', async () => {
    const { repository, runner } = createInMemoryParts();
    const savePublishedInside = () => runner.run((scope) => repository.save(createMemo('memo-b', 'published'), scope));

    await runner.run(async (scope) => {
      const publishedTransaction = savePublishedInside();
      await repository.save(createMemo('memo-a', 'draft'), scope);
      await publishedTransaction;
    });

    const foundA = await repository.findById('memo-a');
    const foundB = await repository.findById('memo-b');
    expect(foundA).toEqual(createMemo('memo-a', 'draft'));
    expect(foundB).toEqual(createMemo('memo-b', 'published'));
  });

  it('TST-303 Transaction の実行中に外で別の id を保存したとき commit 後も外の行が残る', async () => {
    const { repository, runner } = createInMemoryParts();

    await runner.run(async (scope) => {
      await repository.save(createMemo('memo-inside', 'draft'), scope);
      await repository.save(createMemo('memo-outside', 'published'));
    });

    const foundOutside = await repository.findById('memo-outside');
    expect(foundOutside).toEqual(createMemo('memo-outside', 'published'));
  });

  it('TST-304 commit 済みの Transaction の scope で保存したとき Error を投げる', async () => {
    const { repository, runner } = createInMemoryParts();
    const endedScope = await runner.run(async (scope) => scope);

    const saveWithEndedScope = () => repository.save(createMemo('memo-late', 'draft'), endedScope);

    const thrown = await captureThrown(saveWithEndedScope);
    expect(thrown).toBeInstanceOf(Error);
  });

  it('TST-306 rollback 済みの Transaction の scope で保存したとき Error を投げる', async () => {
    const { repository, runner } = createInMemoryParts();
    const endedScope = await captureScopeOfFailedTransaction(runner);

    const saveWithEndedScope = () => repository.save(createMemo('memo-late', 'draft'), endedScope);

    const thrown = await captureThrown(saveWithEndedScope);
    expect(thrown).toBeInstanceOf(Error);
  });
});
