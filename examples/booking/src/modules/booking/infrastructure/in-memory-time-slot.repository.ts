import { TimeSlot } from '@/modules/booking/domain/time-slot';
import type { TimeSlotRepositoryPort } from '@/modules/booking/domain/ports/time-slot.repository.port';
import type { TimeSlotId } from '@/modules/booking/domain/value-objects/time-slot-id';
import { domainError } from '@/shared/kernel/error-catalog';
import { Result, err, ok } from '@/shared/kernel/result';
import type { TenantId } from '@/shared/kernel/tenant-id';

type Row = { readonly capacity: number; readonly reserved: number };

/** 学習用。プロセス内だけに保存し、DB・RLS・認証の代わりにはしない。 */
export class InMemoryTimeSlotRepository implements TimeSlotRepositoryPort {
  private readonly rows = new Map<string, Map<string, Row>>();

  async findById(tenantId: TenantId, id: TimeSlotId): Promise<Result<TimeSlot | null>> {
    const row = this.rows.get(tenantId.value)?.get(id.value);
    if (row === undefined) return ok(null);
    // 復元時に不変条件を再検証する。壊れた行を黙って通さない。
    return TimeSlot.restore(id, tenantId, row.capacity, row.reserved);
  }

  async save(tenantId: TenantId, slot: TimeSlot): Promise<Result<void>> {
    if (!tenantId.equals(slot.tenantId)) {
      return err(domainError('TENANT_MISMATCH', { expected: tenantId.value }));
    }
    const tenantRows = this.rows.get(tenantId.value) ?? new Map<string, Row>();
    // 値だけを保存する。取得側は復元経路を必ず通る (保存後の変更が漏れない)。
    tenantRows.set(slot.id.value, { capacity: slot.capacity, reserved: slot.reservedCount });
    this.rows.set(tenantId.value, tenantRows);
    return ok(undefined);
  }
}
