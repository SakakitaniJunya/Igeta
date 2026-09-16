import { domainError } from '@/shared/kernel/error-catalog';
import { Result, err, ok } from '@/shared/kernel/result';

/** 識別子は文字列を裸で持ち回らない。生成と検証をここに閉じる。 */
export class ReservationId {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<ReservationId> {
    if (!/^[0-9a-z][0-9a-z-]{7,63}$/.test(raw)) {
      return err(domainError('RESERVATION_ID_INVALID', { raw }));
    }
    return ok(new ReservationId(raw));
  }

  equals(other: ReservationId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
