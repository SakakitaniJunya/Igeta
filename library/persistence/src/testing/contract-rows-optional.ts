/** 契約 C11・C12: 任意の項目を消して保存したとき、読み戻しで消えている。null の行を filter で取れる。 */
import { expect, it } from 'vitest';
import { LIST_ALL_LIMIT } from './contract-types';
import type { ContractContext, ContractEntity, ContractOptionalField } from './contract-types';

function toId(entity: ContractEntity): string {
  return entity.id;
}

async function checkRemovedValueIsGone<Entity extends ContractEntity, Filter>(
  context: ContractContext<Entity, Filter>,
  optional: ContractOptionalField<Entity, Filter>,
): Promise<void> {
  const { repository, newId } = context.subject();
  const withValue = optional.withValue(context.fixtures.createEntity(newId(), 'draft'));
  const withoutValue = optional.withoutValue(withValue);
  await repository.save(withValue);
  await repository.save(withoutValue);

  const found = await repository.findById(withValue.id);

  expect(found, '保存した entity が読めない').toBeDefined();
  expect(found !== undefined && optional.hasValue(found), '消したはずの項目が残っている').toBe(false);
}

async function checkFilterTakesRowsWithoutValue<Entity extends ContractEntity, Filter>(
  context: ContractContext<Entity, Filter>,
  optional: ContractOptionalField<Entity, Filter>,
): Promise<void> {
  const { repository, newId } = context.subject();
  const withValue = optional.withValue(context.fixtures.createEntity(newId(), 'draft'));
  const withoutValue = optional.withoutValue(context.fixtures.createEntity(newId(), 'draft'));
  await repository.save(withValue);
  await repository.save(withoutValue);

  const page = await repository.list({ filter: optional.filterWithoutValue(), limit: LIST_ALL_LIMIT });
  const listedIds = page.items.map(toId);

  expect(listedIds, '値が無い行が取れていない').toContain(withoutValue.id);
  expect(listedIds, '値がある行が混ざっている').not.toContain(withValue.id);
}

/** C11・C12 の it を登録する。任意の項目の fixture が無ければ登録しない。 */
export function declareOptionalRows<Entity extends ContractEntity, Filter>(
  context: ContractContext<Entity, Filter>,
): void {
  const { optional } = context.fixtures;
  if (optional === undefined) return;

  it('TST-212 契約 C11 任意の項目を消して保存したとき読み戻しで消えている', () =>
    checkRemovedValueIsGone(context, optional),
  );
  it('TST-213 契約 C12 任意の項目が null の行を filter で取れる', () =>
    checkFilterTakesRowsWithoutValue(context, optional),
  );
}
