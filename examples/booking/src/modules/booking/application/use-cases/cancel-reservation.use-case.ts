import { ValidationError, toAppError } from '@/shared/kernel/app-error';
import { domainError } from '@/shared/kernel/error-catalog';
import type { EventPublisherPort } from '@/shared/kernel/event-publisher.port';
import { TenantId } from '@/shared/kernel/tenant-id';
import {
  CancelReservationInput,
  CancelReservationOutput,
} from '@/modules/booking/application/dto/cancel-reservation.dto';
import { ReservationRepositoryPort } from '@/modules/booking/domain/ports/reservation.repository.port';
import { TimeSlotRepositoryPort } from '@/modules/booking/domain/ports/time-slot.repository.port';
import { ReservationId } from '@/modules/booking/domain/value-objects/reservation-id';

/**
 * 予約をキャンセルする。確定済みだった場合だけ枠を 1 件返す。
 * draft のキャンセルは枠を消費していないため、枠を読み込まない。
 */
export class CancelReservationUseCase {
  constructor(
    private readonly reservations: ReservationRepositoryPort,
    private readonly timeSlots: TimeSlotRepositoryPort,
    private readonly publisher: EventPublisherPort,
    private readonly now: () => Date,
  ) {}

  async execute(input: CancelReservationInput): Promise<CancelReservationOutput> {
    const tenantId = TenantId.create(input.tenantId);
    if (!tenantId.ok) throw new ValidationError(tenantId.error.message, tenantId.error.details);

    const id = ReservationId.create(input.reservationId);
    if (!id.ok) throw new ValidationError(id.error.message, id.error.details);

    const found = await this.reservations.findById(tenantId.value, id.value);
    if (!found.ok) throw toAppError(found.error);
    if (found.value === null) {
      throw toAppError(domainError('RESERVATION_NOT_FOUND', { reservationId: input.reservationId }));
    }
    const reservation = found.value;
    const releasesCapacity = reservation.status === 'confirmed';

    const cancelled = reservation.cancel(this.now());
    if (!cancelled.ok) throw toAppError(cancelled.error);

    if (releasesCapacity) {
      const slot = await this.timeSlots.findById(tenantId.value, reservation.timeSlotId);
      if (!slot.ok) throw toAppError(slot.error);
      if (slot.value === null) {
        throw toAppError(
          domainError('TIME_SLOT_NOT_FOUND', { timeSlotId: reservation.timeSlotId.value }),
        );
      }
      const released = slot.value.release();
      if (!released.ok) throw toAppError(released.error);
      const slotSaved = await this.timeSlots.save(tenantId.value, slot.value);
      if (!slotSaved.ok) throw toAppError(slotSaved.error);
    }

    const saved = await this.reservations.save(tenantId.value, reservation);
    if (!saved.ok) throw toAppError(saved.error);

    const published = await this.publisher.publish(reservation.pullEvents());
    if (!published.ok) throw toAppError(published.error);

    return {
      reservationId: reservation.id.value,
      status: reservation.status,
      releasedCapacity: releasesCapacity,
    };
  }
}
