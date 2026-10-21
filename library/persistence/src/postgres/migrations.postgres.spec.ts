import { sql } from 'kysely';
import { expect, it } from 'vitest';
import { describePostgres } from '#testing/harness/postgres';
import { createPostgres } from '#postgres/client/client';
import { migrateToLatest } from './migrations';

describePostgres('migrateToLatest (Postgres 16)', () => {
  it('TST-506 同じ migration の集まりを 2 回続けて実行したとき 2 回目は何もせず成功する', async () => {
    const db = createPostgres<unknown>(process.env['PG_URL'] ?? '');
    const upCalls: string[] = [];
    const migrations = {
      '0001-probe': {
        up: async () => {
          upCalls.push('0001-probe');
          await sql`create table if not exists migration_probe_postgres (id text primary key)`.execute(db);
        },
      },
    };

    try {
      await migrateToLatest(db, migrations);
      await migrateToLatest(db, migrations);

      expect(upCalls).toEqual(['0001-probe']);
    } finally {
      await sql`drop table if exists migration_probe_postgres, kysely_migration, kysely_migration_lock`.execute(db);
      await db.destroy();
    }
  });
});
