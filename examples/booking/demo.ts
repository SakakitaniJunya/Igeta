import assert from 'node:assert/strict';
import { CancelReservationUseCase } from '@/modules/booking/application/use-cases/cancel-reservation.use-case';
import { ConfirmReservationUseCase } from '@/modules/booking/application/use-cases/confirm-reservation.use-case';
import { CreateReservationUseCase } from '@/modules/booking/application/use-cases/create-reservation.use-case';
import { TimeSlot } from '@/modules/booking/domain/time-slot';
import { ReservationId } from '@/modules/booking/domain/value-objects/reservation-id';
import { TimeSlotId } from '@/modules/booking/domain/value-objects/time-slot-id';
import { InMemoryEventPublisher } from '@/modules/booking/infrastructure/in-memory-event-publisher';
import { InMemoryReservationRepository } from '@/modules/booking/infrastructure/in-memory-reservation.repository';
import { InMemoryTimeSlotRepository } from '@/modules/booking/infrastructure/in-memory-time-slot.repository';
import { AppError } from '@/shared/kernel/app-error';
import { TenantId } from '@/shared/kernel/tenant-id';

const reservations = new InMemoryReservationRepository();
const timeSlots = new InMemoryTimeSlotRepository();
const publisher = new InMemoryEventPublisher();
const now = () => new Date('2026-09-16T00:00:00Z');

const create = new CreateReservationUseCase(reservations, timeSlots, publisher, now);
const confirm = new ConfirmReservationUseCase(reservations, timeSlots, publisher, now);
const cancel = new CancelReservationUseCase(reservations, timeSlots, publisher, now);

const tenant = TenantId.create('sample-outdoor');
const otherTenant = TenantId.create('sample-other');
const slotId = TimeSlotId.create('slot-2026-09-20-1000');
assert(tenant.ok && otherTenant.ok && slotId.ok);

// 定員 1 名の枠を 1 件用意する (移行データ投入の代わり)。
const slot = TimeSlot.create(slotId.value, tenant.value, 1);
assert(slot.ok);
assert((await timeSlots.save(tenant.value, slot.value)).ok);
console.log('0. 枠を用意:', JSON.stringify({ timeSlotId: slotId.value.value, capacity: 1 }));

const first = await create.execute({
  tenantId: 'sample-outdoor',
  reservationId: 'reservation-001',
  timeSlotId: slotId.value.value,
});
console.log('1. 予約作成:', JSON.stringify(first));

const confirmed = await confirm.execute({ tenantId: 'sample-outdoor', reservationId: 'reservation-001' });
console.log('2. 予約確定:', JSON.stringify(confirmed));

const second = await create.execute({
  tenantId: 'sample-outdoor',
  reservationId: 'reservation-002',
  timeSlotId: slotId.value.value,
});
assert.equal(second.status, 'draft');
const soldOut = await confirm
  .execute({ tenantId: 'sample-outdoor', reservationId: 'reservation-002' })
  .catch((error: unknown) => error as AppError);
assert(soldOut instanceof AppError);
console.log('3. 満席の枠を拒否:', soldOut.statusCode, soldOut.details?.code);

const cancelled = await cancel.execute({ tenantId: 'sample-outdoor', reservationId: 'reservation-001' });
console.log('4. キャンセルで枠を返却:', JSON.stringify(cancelled));

const retried = await confirm.execute({ tenantId: 'sample-outdoor', reservationId: 'reservation-002' });
console.log('5. 返却された枠で確定:', JSON.stringify(retried));

const reconfirm = await cancel
  .execute({ tenantId: 'sample-outdoor', reservationId: 'reservation-001' })
  .catch((error: unknown) => error as AppError);
assert(reconfirm instanceof AppError);
console.log('6. 二重キャンセルを拒否:', reconfirm.statusCode, reconfirm.details?.code);

const id = ReservationId.create('reservation-001');
assert(id.ok);
const hidden = await reservations.findById(otherTenant.value, id.value);
assert(hidden.ok && hidden.value === null);
console.log('7. 別テナントからの取得:', hidden.value);

console.log('8. 配信済みイベント:', publisher.published().map((event) => event.name).join(' → '));
console.log('サンプル完了（保存先はメモリのみ）');
