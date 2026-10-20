/** 契約 C7〜C8: Transaction の巻き戻しと、Transaction の中の読み書き。 */
import { expect, it } from 'vitest';
import type { TransactionScope } from '../core/transaction';
import { captureThrown } from './capture-thrown';
import { expectSameContent } from './contract-same-content';
import type { ContractEntity, ContractOptions } from './contract-types';

async function checkThrowingTransactionRollsBack<Entity extends ContractEntity, Filter>(
  options: ContractOptions<Entity, Filter>,
): Promise<void> {
  const { repository, runner, newId } = options.setup();
  const entity = options.fixtures.createEntity(newId(), 'first');
  const failure = new Error('boom');
  const saveThenThrow = async (scope: TransactionScope): Promise<void> => {
    await repository.save(entity, scope);
    throw failure;
  };

  const thrown = await captureThrown(() => runner.run(saveThenThrow));
  const found = await repository.findById(entity.id);

  expect(thrown, 'work の例外がそのまま上がらない').toBe(failure);
  expect(found, 'throw した Transaction の保存が残っている').toBeUndefined();
}

async function checkTransactionReadsAndWrites<Entity extends ContractEntity, Filter>(
  options: ContractOptions<Entity, Filter>,
): Promise<void> {
  const { repository, runner, newId } = options.setup();
  const { createEntity, isSameContent } = options.fixtures;
  const id = newId();
  const initial = createEntity(id, 'first');
  const updated = createEntity(id, 'second');
  await repository.save(initial);
  const readThenSave = async (scope: TransactionScope): Promise<Entity | undefined> => {
    const readInside = await repository.findById(id, scope);
    await repository.save(updated, scope);

    return readInside;
  };

  const readInside = await runner.run(readThenSave);
  const readOutside = await repository.findById(id);

  expectSameContent(readInside, initial, isSameContent);
  expectSameContent(readOutside, updated, isSameContent);
}

/** C7〜C8 の it を登録する。 */
export function declareTransactionRows<Entity extends ContractEntity, Filter>(
  options: ContractOptions<Entity, Filter>,
): void {
  it('TST-207 契約 C7 Transaction の中で保存して throw したとき保存は残らない', () => checkThrowingTransactionRollsBack(options));
  it('TST-208 契約 C8 Transaction の中で読んで保存したとき中で読めて外から更新後が読める', () => checkTransactionReadsAndWrites(options));
}
