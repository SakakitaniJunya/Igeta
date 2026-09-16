import { AppError, NotFoundError, ValidationError, toAppError } from '@/shared/kernel/app-error';
import { TenantId } from '@/shared/kernel/tenant-id';
import {
  CreateReservationInput,
  CreateReservationOutput,
} from '@/modules/booking/application/dto/create-reservation.dto';
import { Reservation } from '@/modules/booking/domain/reservation';
import { ReservationRepositoryPort } from '@/modules/booking/domain/ports/reservation.repository.port';
import { ReservationId } from '@/modules/booking/domain/value-objects/reservation-id';

/**
 * application 層は NestJS に依存しない素のクラス。
 * 配線は infrastructure/booking.providers.ts の useFactory が行う
 * (@nestjs/* の import は dependency-cruiser で禁止)。
 * ドメインの Result はここで AppError に変換して throw する (二層エラー戦略)。
 */
export class CreateReservationUseCase {
  constructor(
    private readonly repository: ReservationRepositoryPort,
    private readonly now: () => Date,
  ) {}

  async execute(input: CreateReservationInput): Promise<CreateReservationOutput> {
    const tenantId = TenantId.create(input.tenantId);
    if (!tenantId.ok) throw new ValidationError(tenantId.error.message, tenantId.error.details);

    const id = ReservationId.create(input.reservationId);
    if (!id.ok) throw new ValidationError(id.error.message, id.error.details);

    const aggregate = Reservation.create(id.value, tenantId.value, this.now());

    const saved = await this.repository.save(tenantId.value, aggregate);
    if (!saved.ok) throw this.toHttpError(saved.error.code, toAppError(saved.error));

    return { reservationId: aggregate.id.value, status: aggregate.status };
  }

  private toHttpError(code: string, fallback: AppError): AppError {
    return code === 'RESERVATION_NOT_FOUND' ? new NotFoundError(fallback.message) : fallback;
  }
}
