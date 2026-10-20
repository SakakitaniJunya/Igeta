/** Postgres の table に保存する Repository。table 名と Mapper の型は利用者の Database 型で検査される。 */
import { sql } from 'kysely';
import type { Insertable, Kysely, Selectable } from 'kysely';
import { assertDocumentId, isDocumentId } from '../core/document-id';
import type { FieldFilter } from '../core/field-filter';
import { assertListLimit, takePage } from '../core/list-page';
import type { ListPage, ListQuery } from '../core/list-page';
import { readStored } from '../core/mapper';
import type { Mapper } from '../core/mapper';
import type { Repository } from '../core/repository';
import type { TransactionScope } from '../core/transaction';
import { withPostgresErrors } from './errors';
import { toGenericDatabase, toStoredRecord } from './generic-database';
import type { GenericDatabase, GenericRow } from './generic-database';
import { sqlScopesFor } from './transaction-scope';

/** SqlRepository の部品。filterFields は絞り込みの値を保存の列へ写す。 */
export interface SqlRepositoryOptions<DB, TB extends keyof DB & string, Entity, Filter> {
  readonly db: Kysely<DB>;
  readonly table: TB;
  readonly mapper: Mapper<Entity, Omit<Selectable<DB[TB]>, 'id'>>;
  readonly filterFields: (filter: Filter) => FieldFilter;
}

/** Mapper を通して行を読み書きする。保存データが不正なら読み出しは unprocessable を投げる。 */
export class SqlRepository<DB, TB extends keyof DB & string, Entity extends { readonly id: string }, Filter>
  implements Repository<Entity, string, Filter>
{
  private readonly options: SqlRepositoryOptions<DB, TB, Entity, Filter>;

  constructor(options: SqlRepositoryOptions<DB, TB, Entity, Filter>) {
    this.options = options;
  }

  async findById(id: string, scope?: TransactionScope): Promise<Entity | undefined> {
    if (!isDocumentId(id)) return undefined;

    const row = await withPostgresErrors(() =>
      this.executor(scope).selectFrom(this.table).selectAll().where('id', '=', id).executeTakeFirst(),
    );

    if (row === undefined) return undefined;
    return readStored(this.options.mapper, id, toStoredRecord(row));
  }

  async list(query: ListQuery<Filter>): Promise<ListPage<Entity>> {
    assertListLimit(query.limit);
    const fields = query.filter === undefined ? {} : this.options.filterFields(query.filter);
    const conditions = Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([column, value]) => sql<boolean>`${sql.ref(column)} = ${value}`);

    // 続きがあるかを知るため、limit より 1 件多く読む。id は文字コード順 (JS の sort と同じ) に並べる
    const rows = await withPostgresErrors(() =>
      this.executor()
        .selectFrom(this.table)
        .selectAll()
        .where((builder) => builder.and(conditions))
        .orderBy(sql`id collate "C"`)
        .limit(query.limit + 1)
        .execute(),
    );

    const page = takePage(rows, query.limit);
    const items = page.items.map((row) => readStored(this.options.mapper, row.id, toStoredRecord(row)));
    return { items, isTruncated: page.isTruncated };
  }

  async save(entity: Entity, scope?: TransactionScope): Promise<void> {
    assertDocumentId(entity.id);
    const values: Insertable<GenericRow> = { id: entity.id, ...this.options.mapper.toRecord(entity) };

    await withPostgresErrors(() =>
      this.executor(scope)
        .insertInto(this.table)
        .values(values)
        .onConflict((conflict) => conflict.column('id').doUpdateSet(values))
        .execute(),
    );
  }

  // 内部の Kysely<GenericDatabase> は table 名を string で受ける。TB の検査は公開側の型で済んでいる
  private get table(): string {
    return this.options.table;
  }

  private executor(scope?: TransactionScope): Kysely<GenericDatabase> {
    if (scope === undefined) return toGenericDatabase(this.options.db);

    return sqlScopesFor(this.options.db).handleOf(scope);
  }
}
