/** Postgres クライアントの生成。Kysely と pg の Pool を使う。 */
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

/** createPostgres の任意の指定。 */
export interface PostgresClientOptions {
  /** 待機中の接続が切れたときに呼ぶ。省略すると stderr に記録する。 */
  readonly onConnectionError?: (error: Error) => void;
}

function logConnectionError(error: Error): void {
  process.stderr.write(`Postgres の待機中の接続でエラー: ${error.message}\n`);
}

/** 接続の Pool を作り、待機中の接続の error を受ける。受けないと、切断でプロセスが落ちる。 */
export function createPool(connectionString: string, options: PostgresClientOptions = {}): Pool {
  const pool = new Pool({ connectionString });
  pool.on('error', options.onConnectionError ?? logConnectionError);

  return pool;
}

/** 接続文字列から Kysely を作る。Database は利用者の table の型 (例: `{ memos: MemoTable }`)。 */
export function createPostgres<Database>(
  connectionString: string,
  options: PostgresClientOptions = {},
): Kysely<Database> {
  const pool = createPool(connectionString, options);

  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
