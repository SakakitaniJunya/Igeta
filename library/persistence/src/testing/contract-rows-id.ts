/** 契約 C10: 形の悪い id は、読むと undefined、保存すると invalid。 */
import { expect, it } from 'vitest';
import { captureThrown } from './capture-thrown';
import { summarizeFailure } from './contract-failure';
import type { ContractContext, ContractEntity } from './contract-types';

const BAD_READ_ID = '../x';
const BAD_SAVE_ID = 'a/b';

async function checkBadIdIsRejected<Entity extends ContractEntity, Filter>(
  context: ContractContext<Entity, Filter>,
): Promise<void> {
  const { repository } = context.subject();
  const entityWithBadId = context.fixtures.createEntity(BAD_SAVE_ID, 'draft');

  const found = await repository.findById(BAD_READ_ID);
  const saveFailure = await captureThrown(() => repository.save(entityWithBadId));

  expect(found, '形の悪い id を読みに行っている').toBeUndefined();
  expect(summarizeFailure(saveFailure).kind, '形の悪い id の保存が invalid でない').toBe('invalid');
}

/** C10 の it を登録する。 */
export function declareIdRows<Entity extends ContractEntity, Filter>(
  context: ContractContext<Entity, Filter>,
): void {
  it('TST-211 契約 C10 形の悪い id のとき findById は undefined、save は invalid を投げる', () =>
    checkBadIdIsRejected(context),
  );
}
