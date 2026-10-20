/** 契約 C4〜C6: 一覧の並び・絞り込み・limit。 */
import { expect, it } from 'vitest';
import type { Repository } from '../core/repository';
import { LIST_ALL_LIMIT } from './contract-types';
import type { ContractContext, ContractEntity } from './contract-types';

const PAGE_LIMIT = 3;

function toId(entity: ContractEntity): string {
  return entity.id;
}

async function saveAll<Entity extends ContractEntity, Filter>(
  repository: Repository<Entity, string, Filter>,
  entities: readonly Entity[],
): Promise<void> {
  for (const entity of entities) {
    await repository.save(entity);
  }
}

async function checkListIsAscendingById<Entity extends ContractEntity, Filter>(
  context: ContractContext<Entity, Filter>,
): Promise<void> {
  const { repository, newId } = context.subject();
  // 昇順と逆の順で保存し、並べ替えが効いていることを確かめる。newId の id だけを使い、後で消せるようにする
  const ownIds = [newId(), newId(), newId()].sort().reverse();
  await saveAll(repository, ownIds.map((id) => context.fixtures.createEntity(id, 'draft')));

  const page = await repository.list({ limit: LIST_ALL_LIMIT });
  const listedIds = page.items.map(toId);

  // id は ASCII だけなので、既定の sort() (文字コード順) が Postgres の COLLATE "C" と同じ並びになる
  expect(listedIds, 'id の昇順になっていない').toEqual([...listedIds].sort());
  expect(listedIds, '保存した 3 件が含まれていない').toEqual(expect.arrayContaining(ownIds));
}

async function checkFilterSelectsOnlyMatchingState<Entity extends ContractEntity, Filter>(
  context: ContractContext<Entity, Filter>,
): Promise<void> {
  const { repository, newId } = context.subject();
  const { createEntity, filterByState, isSameContent } = context.fixtures;
  const draftIds = [newId(), newId()];
  const publishedId = newId();
  const draftEntities = draftIds.map((id) => createEntity(id, 'draft'));
  await saveAll(repository, [...draftEntities, createEntity(publishedId, 'published')]);

  const page = await repository.list({ filter: filterByState('published'), limit: LIST_ALL_LIMIT });
  const listedIds = page.items.map(toId);
  const isEveryItemPublished = page.items.every((item) => isSameContent(item, createEntity(item.id, 'published')));

  expect(isEveryItemPublished, 'published 以外の状態の行が混ざっている').toBe(true);
  expect(listedIds, 'published の 1 件が含まれていない').toContain(publishedId);
  expect(listedIds.filter((id) => draftIds.includes(id)), 'draft の行が混ざっている').toEqual([]);
}

async function checkLimitTruncatesPage<Entity extends ContractEntity, Filter>(
  context: ContractContext<Entity, Filter>,
): Promise<void> {
  const { repository, newId } = context.subject();
  const overLimitIds = Array.from({ length: PAGE_LIMIT + 1 }, () => newId());
  await saveAll(repository, overLimitIds.map((id) => context.fixtures.createEntity(id, 'draft')));

  const page = await repository.list({ limit: PAGE_LIMIT });

  expect(page.items, 'items が limit 件でない').toHaveLength(PAGE_LIMIT);
  expect(page.isTruncated, '続きがあるのに isTruncated が false').toBe(true);
}

/** C4〜C6 の it を登録する。 */
export function declareListRows<Entity extends ContractEntity, Filter>(
  context: ContractContext<Entity, Filter>,
): void {
  it('TST-204 契約 C4 id を 3 件保存したとき list は id の昇順で 3 件を含む', () => checkListIsAscendingById(context));
  it('TST-205 契約 C5 状態の違う行があるとき filter で絞った状態の行だけ返る', () => checkFilterSelectsOnlyMatchingState(context));
  it('TST-206 契約 C6 limit を超えて保存したとき limit 件で isTruncated は true', () => checkLimitTruncatesPage(context));
}
