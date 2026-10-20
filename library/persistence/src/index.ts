/** core の入口。公開面だけを再エクスポートする。 */
export { AppError, conflict, invalid, notFound, unauthorized, unavailable, unprocessable } from './core/app-error';
export type { AppErrorKind } from './core/app-error';
export { assertDocumentId, isDocumentId } from './core/document-id';
export { matchesFieldFilter } from './core/field-filter';
export type { FieldFilter } from './core/field-filter';
export { createUuidGenerator } from './core/id-generator';
export type { IdGenerator } from './core/id-generator';
export { assertListLimit, takePage } from './core/list-page';
export type { ListPage, ListQuery } from './core/list-page';
export { readStored } from './core/mapper';
export type { Mapper } from './core/mapper';
export type { Repository } from './core/repository';
export { err, ok } from './core/result';
export type { Result } from './core/result';
export type { TransactionRunner, TransactionScope } from './core/transaction';
