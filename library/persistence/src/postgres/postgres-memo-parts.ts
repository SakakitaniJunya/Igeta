/** Postgres の spec が使う、memo 用の table・repository・runner・契約の対象。 */
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { FieldFilter } from '../core/field-filter';
import type { ContractSubject } from '../testing/contract-types';
import { memoFilterFields, memoMapper, TITLE_TOO_LONG } from '../testing/memo-fixture';
import type { Memo, MemoFilter } from '../testing/memo-fixture';
import { createPostgres } from './client';
import { SqlRepository } from './repository';
import { SqlTransactionRunner } from './transaction-runner';

// 契約用の table は実装ごとに名前を分ける (CHECK 制約は置かない。C9 で壊れた行を置くため)
const CONTRACT_TABLE = 'contract_memos_postgres';
const BOUNDARY_TABLE = 'boundary_memos_postgres';

interface MemoRow {
  id: string;
  title: string;
  state: string;
}

/** spec が使う table の型。 */
export interface MemoDatabase {
  contract_memos_postgres: MemoRow;
  boundary_memos_postgres: MemoRow;
}

/** memo 用の Postgres の部品。 */
export interface PostgresMemoParts {
  readonly db: Kysely<MemoDatabase>;
  readonly repository: SqlRepository<MemoDatabase, 'contract_memos_postgres', Memo, MemoFilter>;
  readonly runner: SqlTransactionRunner<MemoDatabase>;
}

/** PG_URL に繋ぐ db と、それを使う repository・runner を作る。 */
export function createPostgresMemoParts(
  connectionString: string = process.env['PG_URL'] ?? '',
  filterFields: (filter: MemoFilter) => FieldFilter = memoFilterFields,
): PostgresMemoParts {
  const db = createPostgres<MemoDatabase>(connectionString);
  const repository = new SqlRepository({ db, table: CONTRACT_TABLE, mapper: memoMapper, filterFields });

  return { db, repository, runner: new SqlTransactionRunner(db) };
}

/** 上限の境界を見る専用の repository。他のテストの行と混ざらない。 */
export function createBoundaryRepository(db: Kysely<MemoDatabase>) {
  return new SqlRepository({ db, table: BOUNDARY_TABLE, mapper: memoMapper, filterFields: memoFilterFields });
}

/** spec 用の table を作る。無ければ作り、あれば何もしない。 */
export async function createMemoTables(db: Kysely<MemoDatabase>): Promise<void> {
  for (const table of [CONTRACT_TABLE, BOUNDARY_TABLE]) {
    await db.schema
      .createTable(table)
      .ifNotExists()
      .addColumn('id', 'text', (column) => column.primaryKey())
      .addColumn('title', 'text')
      .addColumn('state', 'text')
      .execute();
  }
}

/** spec 用の table を消す。 */
export async function dropMemoTables(db: Kysely<MemoDatabase>): Promise<void> {
  for (const table of [CONTRACT_TABLE, BOUNDARY_TABLE]) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}

// 型付きの列では「title が文字列でない」を NULL で再現する
const RAW_ROWS: Readonly<Record<string, { title: string | null; state: string }>> = {
  'title-too-long': { title: TITLE_TOO_LONG, state: 'draft' },
  'title-not-string': { title: null, state: 'draft' },
  'state-invalid': { title: '下書き', state: 'archived' },
};

/** 契約の対象にする。table は setup で作り、close で消して接続を閉じる。 */
export async function createPostgresMemoSubject(parts: PostgresMemoParts): Promise<ContractSubject<Memo, MemoFilter>> {
  const { db, repository, runner } = parts;
  await createMemoTables(db);
  const plantMalformed = async (kind: string, id: string): Promise<void> => {
    const row = RAW_ROWS[kind];
    if (row === undefined) throw new Error(`知らない種類: ${kind}`);

    const table = sql.table(CONTRACT_TABLE);
    await sql`insert into ${table} (id, title, state) values (${id}, ${row.title}, ${row.state})`.execute(db);
  };

  return {
    repository,
    runner,
    newId: () => crypto.randomUUID(),
    remove: async (id) => {
      await db.deleteFrom(CONTRACT_TABLE).where('id', '=', id).execute();
    },
    plantMalformed,
    close: async () => {
      await dropMemoTables(db);
      await db.destroy();
    },
  };
}

/** 契約の壊れた保存データの種類。 */
export const POSTGRES_MALFORMED_KINDS = Object.keys(RAW_ROWS);
