import { DomainEvent } from '@/shared/kernel/domain-event';

/** 確定の通知。枠の消費を伴うため、購読側は timeSlotId も受け取る。 */
export class ReservationConfirmedEvent implements DomainEvent {
  readonly name = 'booking.reservation.confirmed';

  constructor(
    readonly tenantId: string,
    readonly occurredAt: Date,
    readonly payload: Readonly<{ reservationId: string; timeSlotId: string }>,
  ) {}
}
