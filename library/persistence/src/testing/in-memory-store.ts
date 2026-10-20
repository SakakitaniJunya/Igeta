/** InMemory 実装の保存先。record を id で持ち、Transaction の巻き戻しを再現する。 */
import { createScopeHandles } from '../core/scope-handle';
import type { TransactionScope } from '../core/transaction';

/** id と保存の形の組。 */
export interface StoredRow<StoredRecord> {
  readonly id: string;
  readonly record: StoredRecord;
}

function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;

  return 0;
}

/** record を id で持つ。Transaction の中の書き込みは、成功したときだけ反映する。 */
export class InMemoryStore<StoredRecord> {
  private committed = new Map<string, StoredRecord>();
  private readonly scopes = createScopeHandles<Map<string, StoredRecord>>();

  /** id の record を返す。scope があれば、その Transaction の中の書き込みを含めて読む。 */
  read(id: string, scope?: TransactionScope): StoredRecord | undefined {
    return this.visibleRecords(scope).get(id);
  }

  /** record を書く。scope があれば、その Transaction が成功したときに反映する。 */
  write(id: string, record: StoredRecord, scope?: TransactionScope): void {
    this.visibleRecords(scope).set(id, record);
  }

  /** 全 record を id の昇順 (文字コード順。Postgres の COLLATE "C" と同じ) で返す。 */
  sortedRows(): StoredRow<StoredRecord>[] {
    const rows = [...this.committed].map(([id, record]) => ({ id, record }));

    return rows.sort((left, right) => compareIds(left.id, right.id));
  }

  /** 壊れた record を、Mapper を通さず生で置く。Firestore・Postgres の harness と同じ形で呼ぶ。 */
  async putRaw(id: string, record: StoredRecord): Promise<void> {
    this.committed.set(id, record);
  }

  /** work を 1 つの Transaction で実行する。work が throw したら書き込みを捨てる。 */
  async runInTransaction<Result>(work: (scope: TransactionScope) => Promise<Result>): Promise<Result> {
    const pending = new Map(this.committed);
    const scope = this.scopes.createScope(pending);

    const result = await work(scope);
    this.committed = pending;

    return result;
  }

  private visibleRecords(scope: TransactionScope | undefined): Map<string, StoredRecord> {
    if (scope === undefined) return this.committed;

    return this.scopes.handleOf(scope);
  }
}
