/** Postgres の失敗の翻訳。接続できない失敗だけを unavailable にし、他は素通しにする。 */
import { unavailable } from '../core/app-error';

// SQLSTATE のクラス 08 は接続の失敗
const CONNECTION_EXCEPTION_CLASS = '08';
// 接続先に届かないときは SQLSTATE が付かず、Node の code が付く
const NODE_CONNECTION_CODES: readonly string[] = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];

function isConnectionCode(code: unknown): boolean {
  if (typeof code !== 'string') return false;

  return code.startsWith(CONNECTION_EXCEPTION_CLASS) || NODE_CONNECTION_CODES.includes(code);
}

/** 接続の失敗を unavailable の AppError にする。それ以外はそのまま返す。 */
export function translatePostgresError(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return error;
  const code = Reflect.get(error, 'code');
  if (!isConnectionCode(code)) return error;

  return unavailable('Postgres に接続できません', { code });
}

/** work の失敗を翻訳して投げ直す。DB を呼ぶ処理を包む。 */
export async function withPostgresErrors<Result>(work: () => Promise<Result>): Promise<Result> {
  try {
    return await work();
  } catch (thrown) {
    throw translatePostgresError(thrown);
  }
}
