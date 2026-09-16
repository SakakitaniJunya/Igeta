import { DomainEvent } from '@/shared/kernel/domain-event';

/** コンテキスト外へ出る形はイベントだけ。他 module は集約ではなくこれを購読する。 */
export class ReservationCreatedEvent implements DomainEvent {
  readonly name = 'booking.reservation.created';

  constructor(
    readonly tenantId: string,
    readonly occurredAt: Date,
    readonly payload: Readonly<{ reservationId: string; timeSlotId: string }>,
  ) {}
}
