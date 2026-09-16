import { Result } from '@/shared/kernel/result';
import { TenantId } from '@/shared/kernel/tenant-id';
import { TimeSlot } from '@/modules/booking/domain/time-slot';
import { TimeSlotId } from '@/modules/booking/domain/value-objects/time-slot-id';

/** 予約枠の保存面。予約集約とは別 port にし、保存単位が集約ごとであることを型で示す。 */
export interface TimeSlotRepositoryPort {
  findById(tenantId: TenantId, id: TimeSlotId): Promise<Result<TimeSlot | null>>;
  save(tenantId: TenantId, aggregate: TimeSlot): Promise<Result<void>>;
}

/** DI トークン。port と同じファイルに置く。 */
export const TIME_SLOT_REPOSITORY = Symbol('TimeSlotRepositoryPort');
