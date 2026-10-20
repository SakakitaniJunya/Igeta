/** Repository の契約 C1〜C9。Firestore・Postgres・InMemory で同じ本文を通す。 */
import { describe } from 'vitest';
import { declareBasicRows } from './contract-rows-basic';
import { declareListRows } from './contract-rows-list';
import { declareMalformedRows } from './contract-rows-malformed';
import { declareTransactionRows } from './contract-rows-transaction';
import type { ContractEntity, ContractOptions, ContractSubject } from './contract-types';

/** 壊れた保存データの種類があるのに、置く関数がなければ登録時に投げる。 */
export function assertMalformedPlanter<Entity extends ContractEntity, Filter>(
  subject: ContractSubject<Entity, Filter>,
  malformedKinds: readonly string[],
): void {
  if (malformedKinds.length === 0 || subject.malformed !== undefined) return;

  throw new Error('malformedKinds があるのに、setup が malformed (plant・remove) を返していない');
}

/** 実装が契約 C1〜C9 を通すかを確かめる describe を登録する。setup は 1 回だけ呼ぶ。 */
export function describeRepositoryContract<Entity extends ContractEntity, Filter>(
  options: ContractOptions<Entity, Filter>,
): void {
  const subject = options.setup();
  assertMalformedPlanter(subject, options.malformedKinds);
  const context = { subject, fixtures: options.fixtures };

  describe(options.name, () => {
    declareBasicRows(context);
    declareListRows(context);
    declareTransactionRows(context);
    declareMalformedRows(context, options.malformedKinds);
  });
}
