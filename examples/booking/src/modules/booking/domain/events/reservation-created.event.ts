import { DomainEvent } from '@/shared/kernel/domain-event';

/** コンテキスト間へ出る唯一の形。他 module はこのイベントだけを購読する。 */
export class ReservationCreatedEvent implements DomainEvent {
  readonly name = 'booking.reservation.created';

  constructor(
    readonly tenantId: string,
    readonly occurredAt: Date,
    readonly payload: Readonly<{ reservationId: string }>,
  ) {}
}
