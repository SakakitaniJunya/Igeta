/** 契約 C1〜C3: 保存していない id・保存した内容・上書き。 */
import { expect, it } from 'vitest';
import { expectSameContent } from './contract-same-content';
import type { ContractEntity, ContractOptions } from './contract-types';

async function checkUnsavedIdIsUndefined<Entity extends ContractEntity, Filter>(
  options: ContractOptions<Entity, Filter>,
): Promise<void> {
  const { repository, newId } = options.setup();
  const unsavedId = newId();

  const found = await repository.findById(unsavedId);

  expect(found).toBeUndefined();
}

async function checkSavedEntityIsRead<Entity extends ContractEntity, Filter>(
  options: ContractOptions<Entity, Filter>,
): Promise<void> {
  const { repository, newId } = options.setup();
  const { createEntity, isSameContent } = options.fixtures;
  const saved = createEntity(newId(), 'first');
  await repository.save(saved);

  const found = await repository.findById(saved.id);

  expectSameContent(found, saved, isSameContent);
}

async function checkSecondSaveOverwrites<Entity extends ContractEntity, Filter>(
  options: ContractOptions<Entity, Filter>,
): Promise<void> {
  const { repository, newId } = options.setup();
  const { createEntity, isSameContent } = options.fixtures;
  const id = newId();
  await repository.save(createEntity(id, 'first'));
  const overwriting = createEntity(id, 'second');

  await repository.save(overwriting);
  const found = await repository.findById(id);

  expectSameContent(found, overwriting, isSameContent);
}

/** C1〜C3 の it を登録する。 */
export function declareBasicRows<Entity extends ContractEntity, Filter>(
  options: ContractOptions<Entity, Filter>,
): void {
  it('TST-201 契約 C1 保存していない id のとき findById は undefined を返す', () => checkUnsavedIdIsUndefined(options));
  it('TST-202 契約 C2 保存した entity のとき同じ id で読むと同じ内容が返る', () => checkSavedEntityIsRead(options));
  it('TST-203 契約 C3 同じ id に 2 回保存したとき 2 回目の内容が読める', () => checkSecondSaveOverwrites(options));
}
