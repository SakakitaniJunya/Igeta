/** 集約 1 つの永続化の port。実装は Firestore・Postgres・InMemory が持つ。 */
import type { ListPage, ListQuery } from './list-page';
import type { TransactionScope } from './transaction';

/** 集約の保存と読み出し。scope を渡すと Transaction の中で実行する。 */
export interface Repository<Entity, Id, Filter> {
  findById(id: Id, scope?: TransactionScope): Promise<Entity | undefined>;
  list(query: ListQuery<Filter>): Promise<ListPage<Entity>>;
  save(entity: Entity, scope?: TransactionScope): Promise<void>;
}
