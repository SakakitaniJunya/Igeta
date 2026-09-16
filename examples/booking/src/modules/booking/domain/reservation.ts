import { DomainError, Result, err, ok } from '@/shared/kernel/result';
import { TenantId } from '@/shared/kernel/tenant-id';
import { ReservationCreatedEvent } from '@/modules/booking/domain/events/reservation-created.event';
import { ReservationId } from '@/modules/booking/domain/value-objects/reservation-id';

/** 列挙は enum ではなく union type で表す (図では <<enumeration>> を付けた class として描く)。 */
export type ReservationStatus = 'draft' | 'confirmed' | 'cancelled';

const ALLOWED: Readonly<Record<ReservationStatus, readonly ReservationStatus[]>> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  cancelled: [],
};

export class Reservation {
  private readonly pending: ReservationCreatedEvent[] = [];

  private constructor(
    readonly id: ReservationId,
    readonly tenantId: TenantId,
    private currentStatus: ReservationStatus,
  ) {}

  static create(id: ReservationId, tenantId: TenantId, now: Date): Reservation {
    const created = new Reservation(id, tenantId, 'draft');
    created.pending.push(
      new ReservationCreatedEvent(tenantId.value, now, { reservationId: id.value }),
    );
    return created;
  }

  /** 永続層からの復元。不変条件を再検証してから組み立てる。 */
  static restore(
    id: ReservationId,
    tenantId: TenantId,
    status: ReservationStatus,
  ): Reservation {
    return new Reservation(id, tenantId, status);
  }

  get status(): ReservationStatus {
    return this.currentStatus;
  }

  transitionTo(next: ReservationStatus): Result<void> {
    if (!ALLOWED[this.currentStatus].includes(next)) {
      return err(
        new DomainError('RESERVATION_TRANSITION_FORBIDDEN', '許可されていない状態遷移', {
          from: this.currentStatus,
          to: next,
        }),
      );
    }
    this.currentStatus = next;
    return ok(undefined);
  }

  /** 発生済みイベントを取り出す (取り出したら空にする)。publish は application 層の責務。 */
  pullEvents(): readonly ReservationCreatedEvent[] {
    return this.pending.splice(0, this.pending.length);
  }
}
