/** Transaction の型。scope の中身は利用者に見せない。 */

/** Transaction の中であることを示す印。中身は runner だけが読む。 */
export interface TransactionScope {
  readonly kind: 'transaction-scope';
}

/** work を 1 つの Transaction で実行する。work が throw したら全部巻き戻す。 */
export interface TransactionRunner {
  run<Result>(work: (scope: TransactionScope) => Promise<Result>): Promise<Result>;
}
