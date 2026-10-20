/** Firestore の失敗の翻訳。接続できない (code 14) だけを unavailable にし、他は素通しにする。 */
import { unavailable } from '../core/app-error';

// gRPC の UNAVAILABLE
const UNAVAILABLE_CODE = 14;

/** code 14 の Error を unavailable の AppError にする。それ以外はそのまま返す。 */
export function translateFirestoreError(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return error;
  if (Reflect.get(error, 'code') !== UNAVAILABLE_CODE) return error;

  return unavailable('Firestore に接続できません', { code: UNAVAILABLE_CODE });
}

/** work の失敗を翻訳して投げ直す。SDK を呼ぶ処理を包む。 */
export async function withFirestoreErrors<Result>(work: () => Promise<Result>): Promise<Result> {
  try {
    return await work();
  } catch (thrown) {
    throw translateFirestoreError(thrown);
  }
}
