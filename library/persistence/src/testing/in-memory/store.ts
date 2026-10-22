/** InMemory 実装の保存先。record を id で持ち、Transaction の巻き戻しを再現する。 */
import { createScopeHandles } from '#core/transaction/scope-handle';
import type { TransactionScope } from '#core/transaction/transaction';

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

/** record を id で持つ。Transaction の書き込みは、その Transaction が書いた id だけを成功したときに反映する。 */
export class InMemoryStore<StoredRecord> {
  private readonly committed = new Map<string, StoredRecord>();
  // Transaction ごとの、まだ反映していない書き込み
  private readonly scopes = createScopeHandles<Map<string, StoredRecord>>();

  /** id の record を返す。scope があれば、その Transaction の未反映の書き込みを先に見る。 */
  read(id: string, scope?: TransactionScope): StoredRecord | undefined {
    if (scope === undefined) return this.committed.get(id);

    return this.scopes.handleOf(scope).get(id) ?? this.committed.get(id);
  }

  /** record を書く。scope があれば、その Transaction が成功したときに反映する。 */
  write(id: string, record: StoredRecord, scope?: TransactionScope): void {
    if (scope === undefined) {
      this.committed.set(id, record);
      return;
    }

    this.scopes.handleOf(scope).set(id, record);
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

  /** id の record を消す。無い id を消しても失敗しない。 */
  async remove(id: string): Promise<void> {
    this.committed.delete(id);
  }

  /** work を 1 つの Transaction で実行する。work が throw したら書き込みを捨てる。 */
  async runInTransaction<Result>(work: (scope: TransactionScope) => Promise<Result>): Promise<Result> {
    const pendingWrites = new Map<string, StoredRecord>();
    const scope = this.scopes.createScope(pendingWrites);

    try {
      const result = await work(scope);
      for (const [id, record] of pendingWrites) {
        this.committed.set(id, record);
      }

      return result;
    } finally {
      this.scopes.endScope(scope);
    }
  }
}
