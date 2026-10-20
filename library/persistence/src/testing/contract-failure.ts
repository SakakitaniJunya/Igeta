/** 契約テストが、投げられた失敗を {kind, detail} に畳んで比べるための関数。 */
import { AppError } from '../core/app-error';

/** 失敗の種類と detail。 */
export interface FailureSummary {
  readonly kind: string;
  readonly detail: unknown;
}

/** AppError なら kind と detail を、それ以外は kind を 'not-an-app-error' にして返す。 */
export function summarizeFailure(thrown: unknown): FailureSummary {
  if (thrown instanceof AppError) return { kind: thrown.kind, detail: thrown.detail };

  return { kind: 'not-an-app-error', detail: String(thrown) };
}
