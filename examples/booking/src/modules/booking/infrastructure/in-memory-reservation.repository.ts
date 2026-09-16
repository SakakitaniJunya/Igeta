import { Reservation } from '@/modules/booking/domain/reservation';
import type { ReservationRepositoryPort } from '@/modules/booking/domain/ports/reservation.repository.port';
import type { ReservationId } from '@/modules/booking/domain/value-objects/reservation-id';
import { DomainError, err, ok } from '@/shared/kernel/result';
import type { TenantId } from '@/shared/kernel/tenant-id';

/** 学習用。プロセス内だけに保存し、DB・RLS・認証の代わりにはしない。 */
export class InMemoryReservationRepository implements ReservationRepositoryPort {
  private readonly rows = new Map<string, Map<string, Reservation>>();

  async findById(tenantId: TenantId, id: ReservationId) {
    const row = this.rows.get(tenantId.value)?.get(id.value);
    return ok(row ? Reservation.restore(row.id, row.tenantId, row.status) : null);
  }

  async save(tenantId: TenantId, reservation: Reservation) {
    if (!tenantId.equals(reservation.tenantId)) {
      return err(new DomainError('TENANT_MISMATCH', '保存先と予約のテナントが異なる'));
    }
    const tenantRows = this.rows.get(tenantId.value) ?? new Map<string, Reservation>();
    // 保存後のオブジェクト変更が、明示的な save なしに永続状態へ漏れないようコピーする。
    tenantRows.set(reservation.id.value, Reservation.restore(reservation.id, tenantId, reservation.status));
    this.rows.set(tenantId.value, tenantRows);
    return ok(undefined);
  }
}
