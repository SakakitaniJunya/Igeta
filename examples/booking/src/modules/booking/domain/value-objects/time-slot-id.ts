import { domainError } from '@/shared/kernel/error-catalog';
import { Result, err, ok } from '@/shared/kernel/result';

/** 予約枠の識別子。予約 ID と同じ形式だが、型として混ぜない (引数の入れ違いを型で止める)。 */
export class TimeSlotId {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<TimeSlotId> {
    if (!/^[0-9a-z][0-9a-z-]{7,63}$/.test(raw)) {
      return err(domainError('TIME_SLOT_ID_INVALID', { raw }));
    }
    return ok(new TimeSlotId(raw));
  }

  equals(other: TimeSlotId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
