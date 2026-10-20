// repository port の契約テスト。どの DB 実装 (Firestore・RDB …) も、この表の行を同じように通ること。
// 実装ごとの *.emulator.spec.ts などが describe__Aggregate__RepositoryContract を呼ぶ。行の番号 C1〜C9 は README の表と同じ。
// 共有の DB で他のテストと並走するので、保存する id には先頭に "0" を付けて一覧の先頭に寄せ、結果は自分の id だけを見る。

import { afterEach, describe, expect, it } from 'vitest';
import { __Aggregate__, type __Aggregate__Status } from '@/modules/__context__/domain/__aggregate__.js';
import type { __Aggregate__Repository } from '@/modules/__context__/domain/ports/__aggregate__.repository.port.js';
import { __Aggregate__Name } from '@/modules/__context__/domain/value-objects/__aggregate__-name.js';
import type { TransactionRunner } from '@/shared/domain/transaction-runner.js';

export type MalformedKind = 'long-name' | 'bad-status' | 'name-not-string';

/** 実装が契約テストへ渡す物。 */
export interface ContractSetup {
  repository: __Aggregate__Repository;
  runner: TransactionRunner;
  /** 他と重ならない新しい id。 */
  newId: () => string;
  /** 壊れたデータを生で置ける実装だけが渡す。無ければ C9 は表から外れる (題名に出る)。 */
  plantMalformed?: (id: string, kind: MalformedKind) => Promise<void>;
  /** 各行の後に呼ぶ後片付け (任意)。C9 で置いた壊れたデータも、ここで必ず消す。 */
  cleanup?: () => Promise<void>;
}

const MALFORMED_KINDS: ReadonlyArray<MalformedKind> = ['long-name', 'bad-status', 'name-not-string'];

export function describe__Aggregate__RepositoryContract(name: string, setup: () => Promise<ContractSetup>): void {
  describe(name, async () => {
    const { repository, runner, newId, plantMalformed, cleanup } = await setup();

    afterEach(async () => {
      await cleanup?.();
    });

    const make = (id: string, status: __Aggregate__Status = 'open'): __Aggregate__ =>
      new __Aggregate__({ id, name: __Aggregate__Name.create('名前'), status });
    // 先頭 "0" で、他のテストが残した id より先に一覧へ出る。
    const sortedId = (): string => `0${newId()}`;
    const save = (entity: __Aggregate__): Promise<void> => runner.run((scope) => repository.save(entity, scope));

    it('C1 無い id は undefined', async () => {
      expect(await repository.findById(newId())).toBeUndefined();
    });

    it('C2 保存した物を同じ内容で読み戻せる', async () => {
      const id = newId();
      await save(make(id));

      const found = await repository.findById(id);

      expect(found?.id).toBe(id);
      expect(found?.name.value).toBe('名前');
      expect(found?.status).toBe('open');
    });

    it('C3 同じ id への保存は上書き', async () => {
      const id = newId();
      await save(make(id, 'open'));
      await save(make(id, 'closed'));

      expect((await repository.findById(id))?.status).toBe('closed');
    });

    it('C4 一覧は id の昇順', async () => {
      const ids = [sortedId(), sortedId(), sortedId()];
      for (const id of ids) await save(make(id));

      const listed = (await repository.list(undefined, 10)).map((row) => row.id);

      expect(listed).toEqual([...listed].sort());
      expect(listed).toEqual(expect.arrayContaining(ids));
    });

    it('C5 一覧は status で絞れる', async () => {
      const [open1, open2, closed1] = [sortedId(), sortedId(), sortedId()];
      await save(make(open1));
      await save(make(open2));
      await save(make(closed1, 'closed'));

      const rows = await repository.list('closed', 10);

      expect(rows.every((row) => row.status === 'closed')).toBe(true);
      const ids = rows.map((row) => row.id);
      expect(ids).toContain(closed1);
      expect(ids).not.toContain(open1);
      expect(ids).not.toContain(open2);
    });

    it('C6 一覧は limit 件で打ち切る', async () => {
      const limit = 3;
      for (let i = 0; i <= limit; i += 1) await save(make(sortedId()));

      expect(await repository.list(undefined, limit)).toHaveLength(limit);
    });

    it('C7 Tx の中で失敗すると保存されない', async () => {
      const id = newId();

      await expect(
        runner.run(async (scope) => {
          await repository.save(make(id), scope);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await repository.findById(id)).toBeUndefined();
    });

    it('C8 Tx の中で読んで閉じて書くと、閉じた状態で読み戻せる', async () => {
      const id = newId();
      await save(make(id));

      await runner.run(async (scope) => {
        const current = await repository.findById(id, scope);
        if (current === undefined) throw new Error('保存したはずの物が Tx の中で読めない');
        await repository.save(current.close(), scope);
      });

      expect((await repository.findById(id))?.status).toBe('closed');
    });

    // C9 は壊れたデータを生で置ける実装だけ。置けない実装は、行を表から外したと題名に出す (skip を黙って増やさない)。
    if (plantMalformed === undefined) {
      describe('C9 [この実装は壊れたデータを置けないので、表から外した]', () => {});
    } else {
      for (const kind of MALFORMED_KINDS) {
        it(`C9 保存済みデータが不変条件を外れていると、findById と list は doc id つきの unprocessable (${kind})`, async () => {
          const id = sortedId();
          await plantMalformed(id, kind);
          // 壊れたデータは cleanup (各行の後に必ず走る) が消す。共有の DB で他のテストの list が当たらないように。
          await expect(repository.findById(id)).rejects.toMatchObject({ kind: 'unprocessable', detail: { id } });
          // list は壊れた行に当たると投げる。自分の行が必ず範囲に入るよう、大きい limit で読む。
          await expect(repository.list(undefined, 1000)).rejects.toMatchObject({ kind: 'unprocessable', detail: { id } });
        });
      }
    }
  });
}
