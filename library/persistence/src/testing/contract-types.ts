/** 契約テストが実装者から受け取るものの型。 */
import type { Repository, TransactionRunner } from '../index';

/** 契約が使う 2 つの状態。fixture が自分の entity の状態に対応づける。 */
export type ContractState = 'first' | 'second';

/** 壊れた保存データを、保存先に生で置く関数。id を受け取る。 */
export type PlantMalformed = (id: string) => Promise<void>;

/** 契約を通す対象。実装ごとに setup が作る。 */
export interface ContractSubject<Entity extends { readonly id: string }, Filter> {
  readonly repository: Repository<Entity, string, Filter>;
  readonly runner: TransactionRunner;
  /** 他のテストと重ならない id を返す。 */
  newId(): string;
  /** 壊れた保存データを置く関数の一覧。空なら C9 は表から外れる。 */
  readonly malformed: readonly PlantMalformed[];
}

/** 実装者が渡す fixture。契約の本文は実装ごとに書き換えない。 */
export interface ContractFixtures<Entity extends { readonly id: string }, Filter> {
  createEntity(id: string, state: ContractState): Entity;
  filterByState(state: ContractState): Filter;
  isSameContent(left: Entity, right: Entity): boolean;
}

/** describeRepositoryContract の引数。 */
export interface ContractOptions<Entity extends { readonly id: string }, Filter> {
  readonly name: string;
  readonly setup: () => ContractSubject<Entity, Filter>;
  readonly fixtures: ContractFixtures<Entity, Filter>;
}
