import { DomainEvent } from '@/shared/kernel/domain-event';
import { domainError } from '@/shared/kernel/error-catalog';
import { Result, err, ok } from '@/shared/kernel/result';
import { TenantId } from '@/shared/kernel/tenant-id';
import { ReservationCancelledEvent } from '@/modules/booking/domain/events/reservation-cancelled.event';
import { ReservationConfirmedEvent } from '@/modules/booking/domain/events/reservation-confirmed.event';
import { ReservationCreatedEvent } from '@/modules/booking/domain/events/reservation-created.event';
import { ReservationId } from '@/modules/booking/domain/value-objects/reservation-id';
import { TimeSlotId } from '@/modules/booking/domain/value-objects/time-slot-id';

/** 列挙は enum ではなく union type で表す (図では <<enumeration>> を付けた class として描く)。 */
export type ReservationStatus = 'draft' | 'confirmed' | 'cancelled';

/** 状態を変える事象。集約の公開メソッド名と 1:1 で対応させる。 */
export type ReservationEvent = 'confirm' | 'cancel';

export type ReservationTransition = {
  readonly from: ReservationStatus;
  readonly event: ReservationEvent;
  readonly to: ReservationStatus;
};

/**
 * 遷移表の正典。設計書 docs/design/detail/state-machines/01-reservation.md の
 * 遷移表とは TST-214 で機械照合する (表に無い遷移は起こしてはいけない遷移)。
 */
export const RESERVATION_TRANSITIONS: readonly ReservationTransition[] = [
  { from: 'draft', event: 'confirm', to: 'confirmed' },
  { from: 'draft', event: 'cancel', to: 'cancelled' },
  { from: 'confirmed', event: 'cancel', to: 'cancelled' },
];

export class Reservation {
  private readonly pending: DomainEvent[] = [];

  private constructor(
    readonly id: ReservationId,
    readonly tenantId: TenantId,
    readonly timeSlotId: TimeSlotId,
    private currentStatus: ReservationStatus,
  ) {}

  static create(
    id: ReservationId,
    tenantId: TenantId,
    timeSlotId: TimeSlotId,
    now: Date,
  ): Reservation {
    const created = new Reservation(id, tenantId, timeSlotId, 'draft');
    created.pending.push(
      new ReservationCreatedEvent(tenantId.value, now, {
        reservationId: id.value,
        timeSlotId: timeSlotId.value,
      }),
    );
    return created;
  }

  /** 永続層からの復元。作成イベントは再発行しない。 */
  static restore(
    id: ReservationId,
    tenantId: TenantId,
    timeSlotId: TimeSlotId,
    status: ReservationStatus,
  ): Reservation {
    return new Reservation(id, tenantId, timeSlotId, status);
  }

  get status(): ReservationStatus {
    return this.currentStatus;
  }

  /** 確定する。枠の消費は application 層が TimeSlot 集約に対して行う。 */
  confirm(now: Date): Result<void> {
    const moved = this.applyEvent('confirm');
    if (!moved.ok) return moved;
    this.pending.push(
      new ReservationConfirmedEvent(this.tenantId.value, now, {
        reservationId: this.id.value,
        timeSlotId: this.timeSlotId.value,
      }),
    );
    return ok(undefined);
  }

  /** キャンセルする。確定済みからのキャンセルだけが枠の返却を伴う。 */
  cancel(now: Date): Result<void> {
    const releasedCapacity = this.currentStatus === 'confirmed';
    const moved = this.applyEvent('cancel');
    if (!moved.ok) return moved;
    this.pending.push(
      new ReservationCancelledEvent(this.tenantId.value, now, {
        reservationId: this.id.value,
        timeSlotId: this.timeSlotId.value,
        releasedCapacity,
      }),
    );
    return ok(undefined);
  }

  /** 遷移表に無い遷移は失敗させ、状態を変えない (原則: サイレント縮退禁止)。 */
  private applyEvent(event: ReservationEvent): Result<void> {
    const transition = RESERVATION_TRANSITIONS.find(
      (row) => row.from === this.currentStatus && row.event === event,
    );
    if (transition === undefined) {
      return err(
        domainError('RESERVATION_TRANSITION_FORBIDDEN', { from: this.currentStatus, event }),
      );
    }
    this.currentStatus = transition.to;
    return ok(undefined);
  }

  /** 発生済みイベントを取り出す (取り出したら空にする)。publish は application 層の責務。 */
  pullEvents(): readonly DomainEvent[] {
    return this.pending.splice(0, this.pending.length);
  }
}
