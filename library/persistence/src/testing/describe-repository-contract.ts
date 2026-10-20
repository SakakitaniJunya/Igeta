/** Repository の契約 C1〜C10。Firestore・Postgres・InMemory で同じ本文を通す。 */
import { afterAll, beforeAll, describe } from 'vitest';
import { declareBasicRows } from './contract-rows-basic';
import { declareIdRows } from './contract-rows-id';
import { declareListRows } from './contract-rows-list';
import { declareMalformedRows } from './contract-rows-malformed';
import { declareTransactionRows } from './contract-rows-transaction';
import type { ContractContext, ContractEntity, ContractOptions, ContractSubject } from './contract-types';

/** 壊れた保存データの種類があるのに、置く関数がなければ投げる。 */
export function assertMalformedPlanter<Entity extends ContractEntity, Filter>(
  subject: ContractSubject<Entity, Filter>,
  malformedKinds: readonly string[],
): void {
  if (malformedKinds.length === 0 || subject.plantMalformed !== undefined) return;

  throw new Error('malformedKinds があるのに、setup が plantMalformed を返していない');
}

// newId で作った id を覚えておき、契約の最後に全部消す
function trackNewIds<Entity extends ContractEntity, Filter>(
  subject: ContractSubject<Entity, Filter>,
  trackedIds: string[],
): ContractSubject<Entity, Filter> {
  const newId = (): string => {
    const id = subject.newId();
    trackedIds.push(id);

    return id;
  };

  return { ...subject, newId };
}

async function removeAll<Entity extends ContractEntity, Filter>(
  subject: ContractSubject<Entity, Filter>,
  ids: readonly string[],
): Promise<void> {
  for (const id of ids) {
    await subject.remove(id);
  }
}

/** 実装が契約 C1〜C10 を通すかを確かめる describe を登録する。setup は beforeAll で 1 回だけ呼ぶ。 */
export function describeRepositoryContract<Entity extends ContractEntity, Filter>(
  options: ContractOptions<Entity, Filter>,
): void {
  const ready: { subject?: ContractSubject<Entity, Filter>; trackedIds: string[] } = { trackedIds: [] };
  const subject = (): ContractSubject<Entity, Filter> => {
    if (ready.subject === undefined) throw new Error('setup が終わる前に subject を読んだ');

    return ready.subject;
  };
  const context: ContractContext<Entity, Filter> = { subject, fixtures: options.fixtures };

  describe(options.name, () => {
    beforeAll(async () => {
      const created = await options.setup();
      assertMalformedPlanter(created, options.malformedKinds);
      ready.subject = trackNewIds(created, ready.trackedIds);
    });
    afterAll(async () => {
      if (ready.subject === undefined) return;

      await removeAll(ready.subject, ready.trackedIds);
      await ready.subject.close?.();
    });
    declareBasicRows(context);
    declareIdRows(context);
    declareListRows(context);
    declareTransactionRows(context);
    declareMalformedRows(context, options.malformedKinds);
  });
}
