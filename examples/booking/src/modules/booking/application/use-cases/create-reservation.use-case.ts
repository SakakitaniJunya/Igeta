import { ValidationError, toAppError } from '@/shared/kernel/app-error';
import { domainError } from '@/shared/kernel/error-catalog';
import type { EventPublisherPort } from '@/shared/kernel/event-publisher.port';
import { TenantId } from '@/shared/kernel/tenant-id';
import {
  CreateReservationInput,
  CreateReservationOutput,
} from '@/modules/booking/application/dto/create-reservation.dto';
import { Reservation } from '@/modules/booking/domain/reservation';
import { ReservationRepositoryPort } from '@/modules/booking/domain/ports/reservation.repository.port';
import { TimeSlotRepositoryPort } from '@/modules/booking/domain/ports/time-slot.repository.port';
import { ReservationId } from '@/modules/booking/domain/value-objects/reservation-id';
import { TimeSlotId } from '@/modules/booking/domain/value-objects/time-slot-id';

/**
 * 予約を draft で作る。この時点では枠を消費しない (消費は確定時。ADR-0002)。
 * application 層は NestJS に依存しない素のクラスで、配線は infrastructure が行う。
 * ドメインの Result はここで AppError に変換して throw する (二層エラー戦略)。
 */
export class CreateReservationUseCase {
  constructor(
    private readonly reservations: ReservationRepositoryPort,
    private readonly timeSlots: TimeSlotRepositoryPort,
    private readonly publisher: EventPublisherPort,
    private readonly now: () => Date,
  ) {}

  async execute(input: CreateReservationInput): Promise<CreateReservationOutput> {
    const tenantId = TenantId.create(input.tenantId);
    if (!tenantId.ok) throw new ValidationError(tenantId.error.message, tenantId.error.details);

    const id = ReservationId.create(input.reservationId);
    if (!id.ok) throw new ValidationError(id.error.message, id.error.details);

    const timeSlotId = TimeSlotId.create(input.timeSlotId);
    if (!timeSlotId.ok) throw new ValidationError(timeSlotId.error.message, timeSlotId.error.details);

    // 存在しない枠への予約を作らせない。枠の残数はここでは見ない。
    const slot = await this.timeSlots.findById(tenantId.value, timeSlotId.value);
    if (!slot.ok) throw toAppError(slot.error);
    if (slot.value === null) {
      throw toAppError(domainError('TIME_SLOT_NOT_FOUND', { timeSlotId: input.timeSlotId }));
    }

    const aggregate = Reservation.create(id.value, tenantId.value, timeSlotId.value, this.now());

    const saved = await this.reservations.save(tenantId.value, aggregate);
    if (!saved.ok) throw toAppError(saved.error);

    const published = await this.publisher.publish(aggregate.pullEvents());
    if (!published.ok) throw toAppError(published.error);

    return {
      reservationId: aggregate.id.value,
      timeSlotId: aggregate.timeSlotId.value,
      status: aggregate.status,
    };
  }
}
