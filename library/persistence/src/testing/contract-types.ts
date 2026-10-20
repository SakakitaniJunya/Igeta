/** 契約テストが実装者から受け取るものの型。 */
import type { Repository, TransactionRunner } from '../index';

// 共有の DB に他のテストの行が残っていても、自分の行を取りこぼさない大きさにする
/** 一覧を「全部」読むときの limit。 */
export const LIST_ALL_LIMIT = 1000;

/** 契約が使う 2 つの状態。fixture が自分の entity の状態に対応づける。 */
export type ContractState = 'draft' | 'published';

/** 壊れた保存データを、保存先に生で置く関数。kind は malformedKinds の 1 つ。 */
export type PlantMalformed = (kind: string, id: string) => Promise<void>;

/** 契約が扱う entity が最低限持つもの。 */
export interface ContractEntity {
  readonly id: string;
}

/** 契約を通す対象。実装ごとに setup が作る。 */
export interface ContractSubject<Entity extends ContractEntity, Filter> {
  readonly repository: Repository<Entity, string, Filter>;
  readonly runner: TransactionRunner;
  /** 他のテストと重ならない id を返す。 */
  newId(): string;
  /** id の行を消す。無い id を消しても失敗しない。契約が作った id を最後に全部消すのに使う。 */
  remove(id: string): Promise<void>;
  /** 壊れた保存データを置く関数。malformedKinds が空でないなら必須。 */
  readonly plantMalformed?: PlantMalformed;
  /** 契約の最後に呼ぶ後始末 (接続を閉じるなど)。 */
  close?(): Promise<void> | void;
}

/** 実装者が渡す fixture。契約の本文は実装ごとに書き換えない。 */
export interface ContractFixtures<Entity extends ContractEntity, Filter> {
  createEntity(id: string, state: ContractState): Entity;
  filterByState(state: ContractState): Filter;
  isSameContent(left: Entity, right: Entity): boolean;
}

/** describeRepositoryContract の引数。 */
export interface ContractOptions<Entity extends ContractEntity, Filter> {
  readonly name: string;
  /** 契約の最初 (beforeAll) に 1 回だけ呼ぶ。失敗したら契約は落ちる。各 it は newId の id だけを使い、他の it の行に依存しない。 */
  readonly setup: () => Promise<ContractSubject<Entity, Filter>> | ContractSubject<Entity, Filter>;
  /** 壊れた保存データの種類。1 種類につき C9 の it を 1 つ登録する。空なら C9 は表から外れる。 */
  readonly malformedKinds: readonly string[];
  readonly fixtures: ContractFixtures<Entity, Filter>;
}

/** 各行の check が受け取る、setup 済みの対象と fixture。 */
export interface ContractContext<Entity extends ContractEntity, Filter> {
  /** setup が終わった後に呼ぶ。終わる前に呼ぶと投げる。 */
  subject(): ContractSubject<Entity, Filter>;
  readonly fixtures: ContractFixtures<Entity, Filter>;
}
