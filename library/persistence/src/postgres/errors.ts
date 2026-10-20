/** Postgres の失敗の翻訳。接続できない失敗だけを unavailable にし、他は素通しにする。 */
import { unavailable } from '../core/app-error';
import { translateDatabaseFailure } from '../core/work-failure';

// 接続の失敗とみなす印。表で持つ
// SQLSTATE: クラス 08 (接続の例外)、57P01 (管理者による停止)、57P03 (まだ接続を受け付けない)
const CONNECTION_SQLSTATE_CLASS = '08';
const CONNECTION_SQLSTATES: readonly string[] = ['57P01', '57P03'];
// 接続先に届かないときは SQLSTATE が付かず、Node の code が付く
const CONNECTION_NODE_CODES: readonly string[] = [
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ETIMEDOUT',
];
// pg は待機中の接続が切れると、code を付けずに message だけで知らせる
const CONNECTION_MESSAGES: readonly string[] = ['Connection terminated unexpectedly'];

function hasConnectionCode(code: unknown): boolean {
  if (typeof code !== 'string') return false;

  return (
    code.startsWith(CONNECTION_SQLSTATE_CLASS) ||
    CONNECTION_SQLSTATES.includes(code) ||
    CONNECTION_NODE_CODES.includes(code)
  );
}

function hasConnectionMessage(error: object): boolean {
  const message = Reflect.get(error, 'message');

  return typeof message === 'string' && CONNECTION_MESSAGES.some((known) => message.includes(known));
}

/** 接続の失敗を unavailable の AppError にする。それ以外はそのまま返す。 */
export function translatePostgresError(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return error;
  const code = Reflect.get(error, 'code');
  if (!hasConnectionCode(code) && !hasConnectionMessage(error)) return error;

  return unavailable('Postgres に接続できません', { code });
}

/** DB を呼ぶ処理を包む。接続の失敗は翻訳し、runner の work が投げた失敗はそのまま上げる。 */
export function withPostgresErrors<Result>(run: () => Promise<Result>): Promise<Result> {
  return translateDatabaseFailure(run, translatePostgresError);
}
