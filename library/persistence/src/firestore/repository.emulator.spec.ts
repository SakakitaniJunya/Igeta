import { expect, it } from 'vitest';
import { AppError } from '../core/app-error';
import type { TransactionScope } from '../core/transaction';
import { captureThrown } from '../testing/capture-thrown';
import { describeEmulator } from '../testing/emulator';
import { createMemo } from '../testing/memo-fixture';
import { createFirestoreMemoParts } from './firestore-memo-parts';
import type { FirestoreMemoParts } from './firestore-memo-parts';

const PAGE_LIMIT = 3;

// 他のテストの行と混ざらないよう、テストごとに collection を分け、終わったら行を消して接続を閉じる
async function withIsolatedParts(
  ids: readonly string[],
  body: (parts: FirestoreMemoParts) => Promise<void>,
): Promise<void> {
  const parts = createFirestoreMemoParts(`isolated_${crypto.randomUUID()}`);
  try {
    await body(parts);
  } finally {
    await Promise.all(ids.map((id) => parts.db.collection(parts.collection).doc(id).delete()));
    await parts.db.terminate();
  }
}

describeEmulator('FirestoreRepository の境界 (Firestore emulator)', () => {
  it('TST-704 limit ちょうどの件数だけ保存したとき list は 3 件で isTruncated false を返す', async () => {
    const ids = Array.from({ length: PAGE_LIMIT }, () => crypto.randomUUID());

    await withIsolatedParts(ids, async ({ repository }) => {
      for (const id of ids) await repository.save(createMemo(id, 'draft'));

      const page = await repository.list({ limit: PAGE_LIMIT });

      expect(page.items).toHaveLength(PAGE_LIMIT);
      expect(page.isTruncated).toBe(false);
    });
  });

  it('TST-708 Transaction の中で書いた後に読むとき SDK の拒否が AppError にならずそのまま上がる', async () => {
    const id = crypto.randomUUID();

    await withIsolatedParts([id], async ({ repository, runner }) => {
      const writeThenRead = async (scope: TransactionScope): Promise<void> => {
        await repository.save(createMemo(id, 'draft'), scope);
        await repository.findById(id, scope);
      };

      const thrown = await captureThrown(() => runner.run(writeThenRead));

      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).not.toBeInstanceOf(AppError);
    });
  });

  it('TST-709 同じ行を 2 つの Transaction が競合して更新するとき SDK が繰り返して両方の更新が残る', async () => {
    const id = crypto.randomUUID();

    await withIsolatedParts([id], async ({ repository, runner }) => {
      await repository.save(createMemo(id, 'draft'));
      const appendToTitle = (suffix: string) =>
        runner.run(async (scope) => {
          const current = await repository.findById(id, scope);
          if (current === undefined) throw new Error('保存した memo が読めない');
          await repository.save({ ...current, title: `${current.title}${suffix}` }, scope);
        });

      await Promise.all([appendToTitle('a'), appendToTitle('b')]);
      const updated = await repository.findById(id);

      expect(updated?.title).toContain('a');
      expect(updated?.title).toContain('b');
    });
  });

  it('TST-711 work が ECONNRESET 付きの Error を投げたとき unavailable に翻訳されず、そのまま届く', async () => {
    await withIsolatedParts([], async ({ runner }) => {
      const fromWork = Object.assign(new Error('work の失敗'), { code: 'ECONNRESET' });
      const failInsideWork = async (): Promise<void> => {
        throw fromWork;
      };

      const thrown = await captureThrown(() => runner.run(failInsideWork));

      expect(thrown).toBe(fromWork);
    });
  });
});
