/** Postgres の Transaction で work を実行する runner。 */
import type { Kysely } from 'kysely';
import type { TransactionRunner, TransactionScope } from '#core/transaction/transaction';
import { markWorkFailure } from '#core/transaction/work-failure';
import { withPostgresErrors } from '#postgres/client/errors';
import { toGenericDatabase } from '#postgres/repository/generic-database';
import { sqlScopesFor } from './transaction-scope';

/** work を serializable の 1 つの Transaction で実行する。競合の失敗は再試行せず、そのまま上げる。 */
export class SqlTransactionRunner<DB> implements TransactionRunner {
  private readonly db: Kysely<DB>;

  constructor(db: Kysely<DB>) {
    this.db = db;
  }

  run<Result>(work: (scope: TransactionScope) => Promise<Result>): Promise<Result> {
    return withPostgresErrors(() =>
      this.db
        .transaction()
        .setIsolationLevel('serializable')
        .execute(async (transaction) => {
          const scope = sqlScopesFor(this.db).createScope(toGenericDatabase(transaction));
          try {
            return await markWorkFailure(() => work(scope));
          } finally {
            sqlScopesFor(this.db).endScope(scope);
          }
        }),
    );
  }
}
