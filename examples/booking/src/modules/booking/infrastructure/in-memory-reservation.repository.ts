import { Reservation } from '@/modules/booking/domain/reservation';
import type { ReservationStatus } from '@/modules/booking/domain/reservation';
import type { ReservationRepositoryPort } from '@/modules/booking/domain/ports/reservation.repository.port';
import type { ReservationId } from '@/modules/booking/domain/value-objects/reservation-id';
import { TimeSlotId } from '@/modules/booking/domain/value-objects/time-slot-id';
import { domainError } from '@/shared/kernel/error-catalog';
import { Result, err, ok } from '@/shared/kernel/result';
import type { TenantId } from '@/shared/kernel/tenant-id';

type Row = { readonly timeSlotId: string; readonly status: ReservationStatus };

/** 学習用。プロセス内だけに保存し、DB・RLS・認証の代わりにはしない。 */
export class InMemoryReservationRepository implements ReservationRepositoryPort {
  private readonly rows = new Map<string, Map<string, Row>>();

  async findById(tenantId: TenantId, id: ReservationId): Promise<Result<Reservation | null>> {
    const row = this.rows.get(tenantId.value)?.get(id.value);
    if (row === undefined) return ok(null);
    const timeSlotId = TimeSlotId.create(row.timeSlotId);
    if (!timeSlotId.ok) return timeSlotId;
    return ok(Reservation.restore(id, tenantId, timeSlotId.value, row.status));
  }

  async save(tenantId: TenantId, reservation: Reservation): Promise<Result<void>> {
    if (!tenantId.equals(reservation.tenantId)) {
      return err(domainError('TENANT_MISMATCH', { expected: tenantId.value }));
    }
    const tenantRows = this.rows.get(tenantId.value) ?? new Map<string, Row>();
    // 値だけを保存する。保存後にオブジェクトを変更しても、明示的な save なしには反映されない。
    tenantRows.set(reservation.id.value, {
      timeSlotId: reservation.timeSlotId.value,
      status: reservation.status,
    });
    this.rows.set(tenantId.value, tenantRows);
    return ok(undefined);
  }
}
