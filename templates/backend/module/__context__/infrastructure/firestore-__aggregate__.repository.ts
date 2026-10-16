// Firestore のリポジトリの雛形。`@google-cloud/firestore` を import してよいのは infrastructure と platform だけ (firebase-admin は使わない)。
// doc の形 (__Aggregate__Doc) はここに閉じ、domain には変換してから渡す。

import type { Firestore } from '@google-cloud/firestore';
import { assertValidDocIdSegment, isValidDocIdSegment } from '../../../shared/kernel/doc-id.js';
import type { TransactionScope } from '../../../shared/kernel/transaction-scope.js';
import { __Aggregate__, type __Aggregate__Status } from '../domain/__aggregate__.js';
import type { __Aggregate__Repository } from '../domain/ports/__aggregate__.repository.port.js';
import { __Aggregate__Name } from '../domain/value-objects/__aggregate__-name.js';
import { toTransaction } from './firestore-scope.js';

/** コレクション名は物理データモデル (docs/ai/specs/shared/tables/) と同じにする。 */
const COLLECTION = '__aggregate__s';

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

  async save(entity: __Aggregate__, scope: TransactionScope): Promise<void> {
    assertValidDocIdSegment(entity.id);
    const doc: __Aggregate__Doc = { name: entity.name.value, status: entity.status };
    toTransaction(scope).set(this.db.collection(COLLECTION).doc(entity.id), doc);
  }
}
