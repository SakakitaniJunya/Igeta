import { DomainError, Result, err, ok } from '@/shared/kernel/result';

/** 識別子は文字列を裸で持ち回らない。生成と検証をここに閉じる。 */
export class ReservationId {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<ReservationId> {
    if (!/^[0-9a-z][0-9a-z-]{7,63}$/.test(raw)) {
      return err(new DomainError('RESERVATION_ID_INVALID', 'ReservationId の形式が不正', { raw }));
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
