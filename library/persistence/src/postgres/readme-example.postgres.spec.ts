// README の「Postgres の使い方」と同じ手順を Postgres 16 で流す。table 名だけが README と違う
import { sql } from 'kysely';
import { expect, it } from 'vitest';
import { memoMapper } from '../testing/memo-fixture';
import type { Memo } from '../testing/memo-fixture';
import { describePostgres } from '../testing/postgres-harness';
import { createPostgres } from './client';
import { migrateToLatest } from './migrations';
import { SqlRepository } from './repository';
import { SqlTransactionRunner } from './transaction-runner';

interface Database {
  readme_memos_postgres: { id: string; title: string; state: string };
}

describePostgres('README の Postgres の例 (Postgres 16)', () => {
  it('TST-507 README のとおり migration して保存し list すると 1 件が返り、続きは無い', async () => {
    const database = createPostgres<Database>(process.env['PG_URL'] ?? '');
    try {
      await migrateToLatest(database, {
        '0001-memos': {
          up: async (db) => {
            await db.schema
              .createTable('readme_memos_postgres')
              .addColumn('id', 'text', (column) => column.primaryKey())
              .addColumn('title', 'text')
              .addColumn('state', 'text')
              .execute();
          },
        },
      });
      const memos = new SqlRepository({
        db: database,
        table: 'readme_memos_postgres',
        mapper: memoMapper,
        filterFields: (filter: { state?: Memo['state'] }) => ({ state: filter.state }),
      });
      const runner = new SqlTransactionRunner(database);

      await runner.run((scope) => memos.save({ id: 'm-1', title: 'はじめ', state: 'draft' }, scope));
      const page = await memos.list({ filter: { state: 'draft' }, limit: 20 });

      expect(page.items).toEqual([{ id: 'm-1', title: 'はじめ', state: 'draft' }]);
      expect(page.isTruncated).toBe(false);
    } finally {
      await sql`drop table if exists readme_memos_postgres, kysely_migration, kysely_migration_lock`.execute(database);
      await database.destroy();
    }
  });
});
