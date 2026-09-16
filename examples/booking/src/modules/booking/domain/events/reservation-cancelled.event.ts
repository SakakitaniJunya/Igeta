import { DomainEvent } from '@/shared/kernel/domain-event';

/** キャンセルの通知。確定済みからのキャンセルだけが枠を返すため、releasedCapacity を持つ。 */
export class ReservationCancelledEvent implements DomainEvent {
  readonly name = 'booking.reservation.cancelled';

  constructor(
    readonly tenantId: string,
    readonly occurredAt: Date,
    readonly payload: Readonly<{
      reservationId: string;
      timeSlotId: string;
      releasedCapacity: boolean;
    }>,
  ) {}
}
