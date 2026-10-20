/** Repository の契約 C1〜C9。Firestore・Postgres・InMemory で同じ本文を通す。 */
import { describe } from 'vitest';
import { declareBasicRows } from './contract-rows-basic';
import { declareListRows } from './contract-rows-list';
import { declareMalformedRows } from './contract-rows-malformed';
import { declareTransactionRows } from './contract-rows-transaction';
import type { ContractEntity, ContractOptions } from './contract-types';

/** 実装が契約 C1〜C9 を通すかを確かめる describe を登録する。 */
export function describeRepositoryContract<Entity extends ContractEntity, Filter>(
  options: ContractOptions<Entity, Filter>,
): void {
  describe(options.name, () => {
    declareBasicRows(options);
    declareListRows(options);
    declareTransactionRows(options);
    declareMalformedRows(options);
  });
}
