// application 層以降のエラー。NestJS の ExceptionFilter が HTTP に変換する。
// ドメイン層はこのファイルを import しない (Result<T, DomainError> のみ)。

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
  constructor(message = 'forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
  }
}
export class ConflictError extends AppError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super(message, 'CONFLICT', 409, details);
  }
}

/** DomainError → AppError。既定は 409 (業務不変条件の衝突)。個別 code は use case 側で分岐する。 */
export const toAppError = (error: DomainError): AppError =>
  new ConflictError(error.message, { code: error.code, ...error.details });
