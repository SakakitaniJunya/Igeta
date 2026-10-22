/** Postgres の Transaction を scope に結びつける対応表。db ごとに持ち、同じ db の runner と repository が共有する。 */
import type { Kysely } from 'kysely';
import { createScopeHandles } from '#core/transaction/scope-handle';
import type { ScopeHandles } from '#core/transaction/scope-handle';
import type { GenericDatabase } from '#postgres/repository/generic-database';

const registries = new WeakMap<object, ScopeHandles<Kysely<GenericDatabase>>>();

/** db の scope の対応表を返す。別の db の runner が作った scope や、他の実装の scope は読めず、普通の Error になる。 */
export function sqlScopesFor(db: object): ScopeHandles<Kysely<GenericDatabase>> {
  const existing = registries.get(db);
  if (existing !== undefined) return existing;

  const created = createScopeHandles<Kysely<GenericDatabase>>();
  registries.set(db, created);
  return created;
}
