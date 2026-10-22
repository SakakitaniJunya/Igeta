/** アプリ全体で使う失敗の型と、種類ごとの生成関数。 */

/** 失敗の種類。分岐は message ではなくこの kind で行う。 */
export type AppErrorKind =
  | 'invalid'
  | 'unauthorized'
  | 'not_found'
  | 'conflict'
  | 'unprocessable'
  | 'unavailable';

/** 種類 (kind) と message、任意の detail を持つ失敗。 */
export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly detail?: unknown;

  constructor(kind: AppErrorKind, message: string, detail?: unknown) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.detail = detail;
  }
}

/** 入力が不正なとき。 */
export function invalid(message: string, detail?: unknown): AppError {
  return new AppError('invalid', message, detail);
}

/** 認証されていないとき。 */
export function unauthorized(message: string, detail?: unknown): AppError {
  return new AppError('unauthorized', message, detail);
}

/** 対象が見つからないとき。 */
export function notFound(message: string, detail?: unknown): AppError {
  return new AppError('not_found', message, detail);
}

/** 現在の状態と衝突したとき。 */
export function conflict(message: string, detail?: unknown): AppError {
  return new AppError('conflict', message, detail);
}

/** 保存データが読めないとき。 */
export function unprocessable(message: string, detail?: unknown): AppError {
  return new AppError('unprocessable', message, detail);
}

/** 接続できないなど、あとで再試行できるとき。 */
export function unavailable(message: string, detail?: unknown): AppError {
  return new AppError('unavailable', message, detail);
}
