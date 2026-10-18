export type AppErrorKind =
  | 'unauthorized'
  | 'not_found'
  | 'conflict'
  | 'invalid'
  | 'unavailable'
  | 'unprocessable';

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

export const unauthorized = (message: string): AppError =>
  new AppError('unauthorized', message);

export const invalid = (message: string, detail?: unknown): AppError =>
  new AppError('invalid', message, detail);

export const notFound = (message: string, detail?: unknown): AppError =>
  new AppError('not_found', message, detail);

export const conflict = (message: string, detail?: unknown): AppError =>
  new AppError('conflict', message, detail);

export const unprocessable = (message: string, detail?: unknown): AppError =>
  new AppError('unprocessable', message, detail);

export const unavailable = (message: string, detail?: unknown): AppError =>
  new AppError('unavailable', message, detail);
