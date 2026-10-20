/** InMemoryStore に保存する Repository。契約テストの基準になる実装。 */
import { matchesFieldFilter } from '../core/field-filter';
import type { FieldFilter } from '../core/field-filter';
import { takePage } from '../core/list-page';
import type { ListPage, ListQuery } from '../core/list-page';
import { readStored } from '../core/mapper';
import type { Mapper } from '../core/mapper';
import type { Repository } from '../core/repository';
import type { TransactionScope } from '../core/transaction';
import type { InMemoryStore } from './in-memory-store';

/** InMemoryRepository の部品。filterFields は絞り込みの値を保存の項目へ写す。 */
export interface InMemoryRepositoryOptions<Entity, StoredRecord extends object, Filter> {
  readonly store: InMemoryStore<StoredRecord>;
  readonly mapper: Mapper<Entity, StoredRecord>;
  readonly filterFields: (filter: Filter) => FieldFilter;
}

/** Mapper を通して record を読み書きする。保存データが不正なら読み出しは unprocessable を投げる。 */
export class InMemoryRepository<Entity extends { readonly id: string }, StoredRecord extends object, Filter>
  implements Repository<Entity, string, Filter>
{
  private readonly options: InMemoryRepositoryOptions<Entity, StoredRecord, Filter>;

  constructor(options: InMemoryRepositoryOptions<Entity, StoredRecord, Filter>) {
    this.options = options;
  }

  async findById(id: string, scope?: TransactionScope): Promise<Entity | undefined> {
    const record = this.options.store.read(id, scope);
    if (record === undefined) return undefined;

    return readStored(this.options.mapper, id, record);
  }

  async list(query: ListQuery<Filter>): Promise<ListPage<Entity>> {
    const { store, mapper, filterFields } = this.options;
    const fields = query.filter === undefined ? {} : filterFields(query.filter);
    const matchedRows = store.sortedRows().filter((row) => matchesFieldFilter(row.record, fields));

    const page = takePage(matchedRows, query.limit);

    const items = page.items.map((row) => readStored(mapper, row.id, row.record));
    return { items, truncated: page.truncated };
  }

  async save(entity: Entity, scope?: TransactionScope): Promise<void> {
    const record = this.options.mapper.toRecord(entity);

    this.options.store.write(entity.id, record, scope);
  }
}
