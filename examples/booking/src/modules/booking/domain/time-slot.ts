import { domainError } from '@/shared/kernel/error-catalog';
import { Result, err, ok } from '@/shared/kernel/result';
import { TenantId } from '@/shared/kernel/tenant-id';
import { TimeSlotId } from '@/modules/booking/domain/value-objects/time-slot-id';

/**
 * 予約枠。定員と予約済み数だけを守る集約で、予約そのものは保持しない
 * (集約をまたぐ参照は id のみ。docs/design/detail/domain/02-aggregate-map.md)。
 * 残数は reservedCount と capacity から導出する属性であり、状態として持たない。
 */
export class TimeSlot {
  private constructor(
    readonly id: TimeSlotId,
    readonly tenantId: TenantId,
    readonly capacity: number,
    private reserved: number,
  ) {}

  static create(id: TimeSlotId, tenantId: TenantId, capacity: number): Result<TimeSlot> {
    if (!Number.isInteger(capacity) || capacity < 1) {
      return err(domainError('TIME_SLOT_CAPACITY_INVALID', { capacity }));
    }
    return ok(new TimeSlot(id, tenantId, capacity, 0));
  }

  /** 永続層からの復元。定員と予約済み数の整合を再検証する。 */
  static restore(
    id: TimeSlotId,
    tenantId: TenantId,
    capacity: number,
    reserved: number,
  ): Result<TimeSlot> {
    if (!Number.isInteger(capacity) || capacity < 1) {
      return err(domainError('TIME_SLOT_CAPACITY_INVALID', { capacity }));
    }
    if (!Number.isInteger(reserved) || reserved < 0 || reserved > capacity) {
      return err(domainError('TIME_SLOT_CAPACITY_INVALID', { capacity, reserved }));
    }
    return ok(new TimeSlot(id, tenantId, capacity, reserved));
  }

  get reservedCount(): number {
    return this.reserved;
  }

  /** 残数は導出値。保存もしない (capacity と reservedCount が正)。 */
  get remaining(): number {
    return this.capacity - this.reserved;
  }

  /** 枠を 1 件消費する。満席なら状態を変えない。 */
  reserve(): Result<void> {
    if (this.remaining === 0) {
      return err(
        domainError('TIME_SLOT_SOLD_OUT', {
          timeSlotId: this.id.value,
          capacity: this.capacity,
        }),
      );
    }
    this.reserved += 1;
    return ok(undefined);
  }

  /** 消費した枠を 1 件返す。予約済みが 0 件なら状態を変えない。 */
  release(): Result<void> {
    if (this.reserved === 0) {
      return err(domainError('TIME_SLOT_NOT_RESERVED', { timeSlotId: this.id.value }));
    }
    this.reserved -= 1;
    return ok(undefined);
  }
}
