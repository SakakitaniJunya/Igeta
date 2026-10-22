/** 一覧の問い合わせと結果の型、limit + 1 件から 1 ページを切り出す関数。 */
import { invalid } from '#core/result/app-error';

/** 一覧の問い合わせ。filter を省くと絞らない。limit は 1 以上の整数。 */
export interface ListQuery<Filter> {
  readonly filter?: Filter;
  readonly limit: number;
}

/** 一覧の結果。続きがあるとき isTruncated が true。 */
export interface ListPage<Entity> {
  readonly items: readonly Entity[];
  readonly isTruncated: boolean;
}

/** limit が 1 以上の整数でないとき invalid を投げる。 */
export function assertListLimit(limit: number): void {
  if (Number.isInteger(limit) && limit >= 1) return;

  throw invalid('limit は 1 以上の整数にしてください', { limit });
}

/** 先頭から limit 件を取り、それより多く渡されていれば isTruncated を true にする。呼び出し側は limit + 1 件まで読む。 */
export function takePage<Row>(rows: readonly Row[], limit: number): ListPage<Row> {
  assertListLimit(limit);

  return { items: rows.slice(0, limit), isTruncated: rows.length > limit };
}
