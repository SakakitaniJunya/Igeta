/** Firestore の collection に保存する Repository。 */
import type { DocumentData, Firestore, Query, QueryDocumentSnapshot } from '@google-cloud/firestore';
import { FieldPath } from '@google-cloud/firestore';
import { assertDocumentId, isDocumentId } from '../core/document-id';
import type { FieldFilter } from '../core/field-filter';
import { assertListLimit, takePage } from '../core/list-page';
import type { ListPage, ListQuery } from '../core/list-page';
import { readStored } from '../core/mapper';
import type { Mapper } from '../core/mapper';
import type { Repository } from '../core/repository';
import type { TransactionScope } from '../core/transaction';
import { withFirestoreErrors } from './errors';
import { toDocumentData, toStoredRecord } from './stored-record';
import { firestoreScopes } from './transaction-scope';

/** FirestoreRepository の部品。filterFields は絞り込みの値を保存の項目へ写す。 */
export interface FirestoreRepositoryOptions<Entity, StoredRecord, Filter> {
  readonly db: Firestore;
  readonly collection: string;
  readonly mapper: Mapper<Entity, StoredRecord>;
  readonly filterFields: (filter: Filter) => FieldFilter;
}

function selectEqualTo(query: Query, fields: FieldFilter): Query {
  const definedEntries = Object.entries(fields).filter(([, value]) => value !== undefined);

  return definedEntries.reduce((narrowed, [field, value]) => narrowed.where(field, '==', value), query);
}

/** Mapper を通して文書を読み書きする。保存データが不正なら読み出しは unprocessable を投げる。 */
export class FirestoreRepository<Entity extends { readonly id: string }, StoredRecord extends object, Filter>
  implements Repository<Entity, string, Filter>
{
  private readonly options: FirestoreRepositoryOptions<Entity, StoredRecord, Filter>;

  constructor(options: FirestoreRepositoryOptions<Entity, StoredRecord, Filter>) {
    this.options = options;
  }

  async findById(id: string, scope?: TransactionScope): Promise<Entity | undefined> {
    if (!isDocumentId(id)) return undefined;
    const reference = this.options.db.collection(this.options.collection).doc(id);

    const snapshot = await withFirestoreErrors(() =>
      scope === undefined ? reference.get() : firestoreScopes.handleOf(scope).get(reference),
    );

    if (!snapshot.exists) return undefined;
    return readStored(this.options.mapper, id, toStoredRecord<StoredRecord>(snapshot.data()));
  }

  async list(query: ListQuery<Filter>): Promise<ListPage<Entity>> {
    assertListLimit(query.limit);
    const { db, collection, mapper, filterFields } = this.options;
    const fields = query.filter === undefined ? {} : filterFields(query.filter);
    // 続きがあるかを知るため、limit より 1 件多く読む
    const ordered = selectEqualTo(db.collection(collection), fields).orderBy(FieldPath.documentId());

    const snapshot = await withFirestoreErrors(() => ordered.limit(query.limit + 1).get());

    const page = takePage<QueryDocumentSnapshot<DocumentData>>(snapshot.docs, query.limit);
    const items = page.items.map((document) => {
      return readStored(mapper, document.id, toStoredRecord<StoredRecord>(document.data()));
    });
    return { items, isTruncated: page.isTruncated };
  }

  async save(entity: Entity, scope?: TransactionScope): Promise<void> {
    assertDocumentId(entity.id);
    const reference = this.options.db.collection(this.options.collection).doc(entity.id);
    const data = toDocumentData(this.options.mapper.toRecord(entity));

    await withFirestoreErrors(async () => {
      if (scope === undefined) {
        await reference.set(data);
        return;
      }

      firestoreScopes.handleOf(scope).set(reference, data);
    });
  }
}
