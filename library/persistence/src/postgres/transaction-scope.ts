/** Postgres の Transaction を scope に結びつける対応表。runner と repository が同じものを使う。 */
import type { Kysely } from 'kysely';
import { createScopeHandles } from '../core/scope-handle';
import type { GenericDatabase } from './generic-database';

/** Postgres の scope を作る・読む。他の実装の scope を渡すと普通の Error になる。 */
export const sqlScopes = createScopeHandles<Kysely<GenericDatabase>>();
