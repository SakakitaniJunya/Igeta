// application 層以降のエラー。NestJS の ExceptionFilter が HTTP に変換する。
// ドメイン層はこのファイルを import しない (Result<T, DomainError> のみ)。

import { lookupError } from '@/shared/kernel/error-catalog';
import { DomainError } from '@/shared/kernel/result';

export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super(message, 'VALIDATION_FAILED', 400, details);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}
export class ForbiddenError extends AppError {
  // details を受け取るのは雛形との差分。403 / 404 でも原因コードを落とさないため。
  constructor(message = 'forbidden', details?: Readonly<Record<string, unknown>>) {
    super(message, 'FORBIDDEN', 403, details);
  }
}
export class NotFoundError extends AppError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super(message, 'NOT_FOUND', 404, details);
  }
}
export class ConflictError extends AppError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super(message, 'CONFLICT', 409, details);
  }
}

/**
 * DomainError → AppError。ステータスは error-catalog.ts の statusCode に従う。
 * カタログ未登録のコード (外部 adapter 由来など) は 409 とする。
 * 「知らないコードを 200 や 500 に丸める」ことはしない (原則: サイレント縮退禁止)。
 */
export const toAppError = (error: DomainError): AppError => {
  const details = { code: error.code, ...error.details };
  switch (lookupError(error.code)?.statusCode) {
    case 400:
      return new ValidationError(error.message, details);
    case 403:
      return new ForbiddenError(error.message, details);
    case 404:
      return new NotFoundError(error.message, details);
    default:
      return new ConflictError(error.message, details);
  }
};
