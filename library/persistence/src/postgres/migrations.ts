/** Kysely の Migrator を包む migration。同じ名前の migration は 2 回目に何もしない。 */
import type { Kysely } from 'kysely';
import { Migrator } from 'kysely/migration';
import type { Migration } from 'kysely/migration';

export type { Migration };

/** migrations (名前 → up / down) を名前の昇順で最新まで流す。失敗したらその Error を投げる。 */
export async function migrateToLatest<DB>(db: Kysely<DB>, migrations: Record<string, Migration>): Promise<void> {
  const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } });

  const { error } = await migrator.migrateToLatest();

  if (error !== undefined) throw error;
}
