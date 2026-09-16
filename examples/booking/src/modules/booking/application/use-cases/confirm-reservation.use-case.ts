import { ValidationError, toAppError } from '@/shared/kernel/app-error';
import { domainError } from '@/shared/kernel/error-catalog';
import type { EventPublisherPort } from '@/shared/kernel/event-publisher.port';
import { TenantId } from '@/shared/kernel/tenant-id';
import {
  ConfirmReservationInput,
  ConfirmReservationOutput,
} from '@/modules/booking/application/dto/confirm-reservation.dto';
import { ReservationRepositoryPort } from '@/modules/booking/domain/ports/reservation.repository.port';
import { TimeSlotRepositoryPort } from '@/modules/booking/domain/ports/time-slot.repository.port';
import { ReservationId } from '@/modules/booking/domain/value-objects/reservation-id';

/**
 * 予約を確定し、枠を 1 件消費する。2 集約 (Reservation / TimeSlot) を順に保存する。
 * メモリ adapter にトランザクションが無いことは承知の上の妥協で、
 * 返済条件は docs/design/01-risks-tech-debt.md の RSK-101 に書いてある。
 */
export class ConfirmReservationUseCase {
  constructor(
    private readonly reservations: ReservationRepositoryPort,
    private readonly timeSlots: TimeSlotRepositoryPort,
    private readonly publisher: EventPublisherPort,
    private readonly now: () => Date,
  ) {}

  async execute(input: ConfirmReservationInput): Promise<ConfirmReservationOutput> {
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

    const slot = await this.timeSlots.findById(tenantId.value, reservation.timeSlotId);
    if (!slot.ok) throw toAppError(slot.error);
    if (slot.value === null) {
      throw toAppError(
        domainError('TIME_SLOT_NOT_FOUND', { timeSlotId: reservation.timeSlotId.value }),
      );
    }

    // 枠の消費 → 予約の確定 の順。どちらかが失敗したら保存しない。
    const reserved = slot.value.reserve();
    if (!reserved.ok) throw toAppError(reserved.error);

    const confirmed = reservation.confirm(this.now());
    if (!confirmed.ok) throw toAppError(confirmed.error);

    const slotSaved = await this.timeSlots.save(tenantId.value, slot.value);
    if (!slotSaved.ok) throw toAppError(slotSaved.error);

    const saved = await this.reservations.save(tenantId.value, reservation);
    if (!saved.ok) throw toAppError(saved.error);

    const published = await this.publisher.publish(reservation.pullEvents());
    if (!published.ok) throw toAppError(published.error);

    return {
      reservationId: reservation.id.value,
      status: reservation.status,
      remainingCapacity: slot.value.remaining,
    };
  }
}
