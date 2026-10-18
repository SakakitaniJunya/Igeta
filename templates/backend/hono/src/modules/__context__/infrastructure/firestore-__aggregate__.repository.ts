// Firestore のリポジトリの雛形。`@google-cloud/firestore` を import してよいのは infrastructure だけ (firebase-admin は使わない)。
// doc の形 (__Aggregate__Doc) はここに閉じ、domain には変換してから渡す。

import type { Firestore } from '@google-cloud/firestore';
import { __Aggregate__, type __Aggregate__Status } from '@/modules/__context__/domain/__aggregate__.js';
import type { __Aggregate__Repository } from '@/modules/__context__/domain/ports/__aggregate__.repository.port.js';
import { __Aggregate__Name } from '@/modules/__context__/domain/value-objects/__aggregate__-name.js';
import { assertValidDocIdSegment, isValidDocIdSegment } from '@/shared/domain/doc-id.js';
import type { TransactionScope } from '@/shared/domain/transaction-scope.js';
import { toTransaction } from './firestore-scope.js';

const COLLECTION = '__aggregates__';

interface __Aggregate__Doc {
  name: string;
  status: __Aggregate__Status;
}

function toDomain(id: string, data: __Aggregate__Doc): __Aggregate__ {
  return new __Aggregate__({ id, name: __Aggregate__Name.create(data.name), status: data.status });
}

export class Firestore__Aggregate__Repository implements __Aggregate__Repository {
  constructor(private readonly db: Firestore) {}

  async findById(id: string, scope?: TransactionScope): Promise<__Aggregate__ | undefined> {
    // `/` などを含む値で祖先のパスへ読みに行かせない。形の悪い id は「見つからない」として扱う。
    if (!isValidDocIdSegment(id)) return undefined;
    const ref = this.db.collection(COLLECTION).doc(id);
    const snapshot = scope === undefined ? await ref.get() : await toTransaction(scope).get(ref);
    const data = snapshot.data() as __Aggregate__Doc | undefined;
    return data === undefined ? undefined : toDomain(id, data);
  }

  async list(status: __Aggregate__Status | undefined, limit: number): Promise<ReadonlyArray<__Aggregate__>> {
    // 並びは doc id の昇順 (Firestore の既定)。status の絞り込みは等価条件だけなので、複合 index は要らない。
    const collection = this.db.collection(COLLECTION);
    const query = status === undefined ? collection : collection.where('status', '==', status);
    const snapshot = await query.limit(limit).get();
    return snapshot.docs.map((doc) => toDomain(doc.id, doc.data() as __Aggregate__Doc));
  }

  async save(entity: __Aggregate__, scope: TransactionScope): Promise<void> {
    assertValidDocIdSegment(entity.id);
    const doc: __Aggregate__Doc = { name: entity.name.value, status: entity.status };
    toTransaction(scope).set(this.db.collection(COLLECTION).doc(entity.id), doc);
  }
}
