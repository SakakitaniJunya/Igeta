import { AppError } from '@/shared/domain/app-error.js';

/** 不変条件の違反: 閉じ済みの集約をもう一度閉じた。種類は conflict (409 になる)。 */
export class __Aggregate__AlreadyClosedError extends AppError {
  readonly id: string;

  constructor(id: string) {
    super('conflict', '__aggregate__ already closed');
    this.name = '__Aggregate__AlreadyClosedError';
    this.id = id;
  }
}
