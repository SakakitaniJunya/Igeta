/** Firestore の Transaction を scope に結びつける対応表。db ごとに持ち、同じ db の runner と repository が共有する。 */
import type { Firestore, Transaction } from '@google-cloud/firestore';
import { createScopeHandles } from '../core/scope-handle';
import type { ScopeHandles } from '../core/scope-handle';

const registries = new WeakMap<Firestore, ScopeHandles<Transaction>>();

/** db の scope の対応表を返す。別の db の runner が作った scope や、他の実装の scope は読めず、普通の Error になる。 */
export function firestoreScopesFor(db: Firestore): ScopeHandles<Transaction> {
  const existing = registries.get(db);
  if (existing !== undefined) return existing;

  const created = createScopeHandles<Transaction>();
  registries.set(db, created);
  return created;
}
