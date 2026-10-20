/** Postgres クライアントの生成。Kysely と pg の Pool を使う。 */
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

/** 接続文字列から Kysely を作る。Database は利用者の table の型 (例: `{ memos: MemoTable }`)。 */
export function createPostgres<Database>(connectionString: string): Kysely<Database> {
  const pool = new Pool({ connectionString });

  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
