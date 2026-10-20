/** core の入口。公開面だけを再エクスポートする。 */
export { AppError, conflict, invalid, notFound, unauthorized, unavailable, unprocessable } from './core/app-error';
export type { AppErrorKind } from './core/app-error';
export { err, ok } from './core/result';
export type { Result } from './core/result';
