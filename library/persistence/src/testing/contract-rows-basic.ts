/** 契約 C1〜C3: 保存していない id・保存した内容・上書き。 */
import { expect, it } from 'vitest';
import { expectSameContent } from './contract-same-content';
import type { ContractEntity, ContractContext } from './contract-types';

async function checkUnsavedIdIsUndefined<Entity extends ContractEntity, Filter>(
  context: ContractContext<Entity, Filter>,
): Promise<void> {
  const { repository, newId } = context.subject();
  const unsavedId = newId();

  const found = await repository.findById(unsavedId);

  expect(found).toBeUndefined();
}

async function checkSavedEntityIsRead<Entity extends ContractEntity, Filter>(
  context: ContractContext<Entity, Filter>,
): Promise<void> {
  const { repository, newId } = context.subject();
  const { createEntity, isSameContent } = context.fixtures;
  const saved = createEntity(newId(), 'draft');
  await repository.save(saved);

  const found = await repository.findById(saved.id);

  expectSameContent(found, saved, isSameContent);
}

async function checkSecondSaveOverwrites<Entity extends ContractEntity, Filter>(
  context: ContractContext<Entity, Filter>,
): Promise<void> {
  const { repository, newId } = context.subject();
  const { createEntity, isSameContent } = context.fixtures;
  const id = newId();
  await repository.save(createEntity(id, 'draft'));
  const overwriting = createEntity(id, 'published');

  await repository.save(overwriting);
  const found = await repository.findById(id);

  expectSameContent(found, overwriting, isSameContent);
}

/** C1〜C3 の it を登録する。 */
export function declareBasicRows<Entity extends ContractEntity, Filter>(
  context: ContractContext<Entity, Filter>,
): void {
  it('TST-201 契約 C1 保存していない id のとき findById は undefined を返す', () => checkUnsavedIdIsUndefined(context));
  it('TST-202 契約 C2 保存した entity のとき同じ id で読むと同じ内容が返る', () => checkSavedEntityIsRead(context));
  it('TST-203 契約 C3 同じ id に 2 回保存したとき 2 回目の内容が読める', () => checkSecondSaveOverwrites(context));
}
