import assert from 'node:assert/strict';
import test from 'node:test';
import { CancelReservationUseCase } from '@/modules/booking/application/use-cases/cancel-reservation.use-case';
import { ConfirmReservationUseCase } from '@/modules/booking/application/use-cases/confirm-reservation.use-case';
import { CreateReservationUseCase } from '@/modules/booking/application/use-cases/create-reservation.use-case';
import { Reservation } from '@/modules/booking/domain/reservation';
import { TimeSlot } from '@/modules/booking/domain/time-slot';
import { ReservationId } from '@/modules/booking/domain/value-objects/reservation-id';
import { TimeSlotId } from '@/modules/booking/domain/value-objects/time-slot-id';
import { InMemoryEventPublisher } from '@/modules/booking/infrastructure/in-memory-event-publisher';
import { InMemoryReservationRepository } from '@/modules/booking/infrastructure/in-memory-reservation.repository';
import { InMemoryTimeSlotRepository } from '@/modules/booking/infrastructure/in-memory-time-slot.repository';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/kernel/app-error';
import { DomainError, err } from '@/shared/kernel/result';
import { TenantId } from '@/shared/kernel/tenant-id';

const now = new Date('2026-09-16T00:00:00Z');

/** 定員 capacity の枠を 1 件持つ、テナント 2 つ分の環境を組む。 */
async function fixture(capacity = 1) {
  const tenant = TenantId.create('sample-outdoor');
  const other = TenantId.create('sample-other');
  const id = ReservationId.create('reservation-001');
  const slotId = TimeSlotId.create('slot-2026-09-20-1000');
  assert(tenant.ok && other.ok && id.ok && slotId.ok);
  const reservations = new InMemoryReservationRepository();
  const timeSlots = new InMemoryTimeSlotRepository();
  const publisher = new InMemoryEventPublisher();
  const slot = TimeSlot.create(slotId.value, tenant.value, capacity);
  assert(slot.ok);
  assert((await timeSlots.save(tenant.value, slot.value)).ok);
  return {
    tenant: tenant.value,
    other: other.value,
    id: id.value,
    slotId: slotId.value,
    reservations,
    timeSlots,
    publisher,
    create: new CreateReservationUseCase(reservations, timeSlots, publisher, () => now),
    confirm: new ConfirmReservationUseCase(reservations, timeSlots, publisher, () => now),
    cancel: new CancelReservationUseCase(reservations, timeSlots, publisher, () => now),
  };
}

/** 呼ばれてはいけない port。呼ばれたら落ちる (無言で通過させない)。 */
const unusedSlots = {
  findById: async () => {
    throw new Error('unexpected time slot read');
  },
  save: async () => {
    throw new Error('unexpected time slot save');
  },
};

test('TST-201 作成した予約は draft で保存され、別テナントには見えない', async () => {
  const { tenant, other, id, slotId, reservations, create } = await fixture();
  assert.deepEqual(
    await create.execute({
      tenantId: tenant.value,
      reservationId: id.value,
      timeSlotId: slotId.value,
    }),
    { reservationId: id.value, timeSlotId: slotId.value, status: 'draft' },
  );
  const saved = await reservations.findById(tenant, id);
  assert(saved.ok && saved.value?.status === 'draft');
  assert.deepEqual(await reservations.findById(other, id), { ok: true, value: null });
});

test('TST-202 キャンセル後の確定は失敗し、状態を変えない', async () => {
  const { tenant, id, slotId } = await fixture();
  const reservation = Reservation.create(id, tenant, slotId, now);
  assert(reservation.cancel(now).ok);
  const result = reservation.confirm(now);
  assert(!result.ok && result.error.code === 'RESERVATION_TRANSITION_FORBIDDEN');
  assert.equal(reservation.status, 'cancelled');
});

test('TST-203 作成イベントにはテナント・ID・枠・注入時刻が入り、一度だけ取り出せる', async () => {
  const { tenant, id, slotId } = await fixture();
  const reservation = Reservation.create(id, tenant, slotId, now);
  const events = reservation.pullEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'booking.reservation.created');
  assert.equal(events[0].tenantId, tenant.value);
  assert.equal(events[0].occurredAt, now);
  assert.deepEqual(events[0].payload, { reservationId: id.value, timeSlotId: slotId.value });
  assert.deepEqual(reservation.pullEvents(), []);
});

test('TST-204 不正な入力は 400 相当となり、保存しない', async () => {
  let saves = 0;
  const create = new CreateReservationUseCase(
    {
      findById: async () => {
        throw new Error('unexpected read');
      },
      save: async () => {
        saves += 1;
        throw new Error('unexpected save');
      },
    },
    unusedSlots,
    new InMemoryEventPublisher(),
    () => now,
  );
  for (const input of [
    { tenantId: '', reservationId: 'reservation-001', timeSlotId: 'slot-2026-09-20-1000' },
    { tenantId: 'sample-outdoor', reservationId: '!', timeSlotId: 'slot-2026-09-20-1000' },
    { tenantId: 'sample-outdoor', reservationId: 'reservation-001', timeSlotId: '!' },
  ]) {
    await assert.rejects(
      create.execute(input),
      (error: unknown) => error instanceof ValidationError && error.statusCode === 400,
    );
  }
  assert.equal(saves, 0);
});

test('TST-205 カタログ未登録の業務エラーは 409 として扱い、元のコードを残す', async () => {
  const { timeSlots, slotId } = await fixture();
  const failing = new CreateReservationUseCase(
    {
      findById: async () => {
        throw new Error('unexpected read');
      },
      save: async () => err(new DomainError('SAMPLE_CONFLICT', '保存競合')),
    },
    timeSlots,
    new InMemoryEventPublisher(),
    () => now,
  );
  await assert.rejects(
    failing.execute({
      tenantId: 'sample-outdoor',
      reservationId: 'reservation-001',
      timeSlotId: slotId.value,
    }),
    (error: unknown) =>
      error instanceof ConflictError &&
      error.statusCode === 409 &&
      error.details?.code === 'SAMPLE_CONFLICT',
  );
});

test('TST-206 越境保存を拒否し、同じ ID を持つ別テナントの予約を分離する', async () => {
  const { tenant, other, id, slotId, reservations } = await fixture();
  const reservation = Reservation.create(id, tenant, slotId, now);
  const denied = await reservations.save(other, reservation);
  assert(!denied.ok && denied.error.code === 'TENANT_MISMATCH');
  assert.deepEqual(await reservations.findById(other, id), { ok: true, value: null });
  assert((await reservations.save(tenant, reservation)).ok);
  const second = Reservation.create(id, other, slotId, now);
  assert(second.confirm(now).ok);
  assert((await reservations.save(other, second)).ok);
  const firstRead = await reservations.findById(tenant, id);
  const secondRead = await reservations.findById(other, id);
  assert(firstRead.ok && firstRead.value?.status === 'draft');
  assert(secondRead.ok && secondRead.value?.status === 'confirmed');
});

test('TST-207 取得後に状態を変えても save するまで保存済みデータは変わらない', async () => {
  const { tenant, id, slotId, reservations, create } = await fixture();
  await create.execute({
    tenantId: tenant.value,
    reservationId: id.value,
    timeSlotId: slotId.value,
  });
  const read = await reservations.findById(tenant, id);
  assert(read.ok && read.value);
  assert(read.value.confirm(now).ok);
  const beforeSave = await reservations.findById(tenant, id);
  assert(beforeSave.ok && beforeSave.value?.status === 'draft');
  assert((await reservations.save(tenant, read.value)).ok);
  const afterSave = await reservations.findById(tenant, id);
  assert(afterSave.ok && afterSave.value?.status === 'confirmed');
});

test('TST-208 存在しない枠への予約作成は 404 相当で拒否する', async () => {
  const { tenant, id, create } = await fixture();
  await assert.rejects(
    create.execute({
      tenantId: tenant.value,
      reservationId: id.value,
      timeSlotId: 'slot-9999-12-31-2359',
    }),
    (error: unknown) =>
      error instanceof NotFoundError && error.details?.code === 'TIME_SLOT_NOT_FOUND',
  );
});

test('TST-209 確定すると枠が 1 件減り、確定イベントが配信される', async () => {
  const { tenant, id, slotId, timeSlots, publisher, create, confirm } = await fixture(2);
  await create.execute({
    tenantId: tenant.value,
    reservationId: id.value,
    timeSlotId: slotId.value,
  });
  assert.deepEqual(await confirm.execute({ tenantId: tenant.value, reservationId: id.value }), {
    reservationId: id.value,
    status: 'confirmed',
    remainingCapacity: 1,
  });
  const slot = await timeSlots.findById(tenant, slotId);
  assert(slot.ok && slot.value?.reservedCount === 1);
  assert.deepEqual(
    publisher.published().map((event) => event.name),
    ['booking.reservation.created', 'booking.reservation.confirmed'],
  );
});

test('TST-210 満席の枠への確定は 409 で拒否し、予約と枠を変えない', async () => {
  const { tenant, id, slotId, reservations, timeSlots, create, confirm } = await fixture(1);
  await create.execute({
    tenantId: tenant.value,
    reservationId: id.value,
    timeSlotId: slotId.value,
  });
  await create.execute({
    tenantId: tenant.value,
    reservationId: 'reservation-002',
    timeSlotId: slotId.value,
  });
  await confirm.execute({ tenantId: tenant.value, reservationId: id.value });
  await assert.rejects(
    confirm.execute({ tenantId: tenant.value, reservationId: 'reservation-002' }),
    (error: unknown) =>
      error instanceof ConflictError && error.details?.code === 'TIME_SLOT_SOLD_OUT',
  );
  const rejected = ReservationId.create('reservation-002');
  assert(rejected.ok);
  const stored = await reservations.findById(tenant, rejected.value);
  assert(stored.ok && stored.value?.status === 'draft');
  const slot = await timeSlots.findById(tenant, slotId);
  assert(slot.ok && slot.value?.reservedCount === 1 && slot.value.remaining === 0);
});

test('TST-211 確定済みのキャンセルは枠を返し、draft のキャンセルは枠を触らない', async () => {
  const { tenant, id, slotId, timeSlots, create, confirm, cancel } = await fixture(1);
  await create.execute({
    tenantId: tenant.value,
    reservationId: id.value,
    timeSlotId: slotId.value,
  });
  await confirm.execute({ tenantId: tenant.value, reservationId: id.value });
  assert.deepEqual(await cancel.execute({ tenantId: tenant.value, reservationId: id.value }), {
    reservationId: id.value,
    status: 'cancelled',
    releasedCapacity: true,
  });
  const afterRelease = await timeSlots.findById(tenant, slotId);
  assert(afterRelease.ok && afterRelease.value?.remaining === 1);

  await create.execute({
    tenantId: tenant.value,
    reservationId: 'reservation-002',
    timeSlotId: slotId.value,
  });
  const draftCancel = await cancel.execute({
    tenantId: tenant.value,
    reservationId: 'reservation-002',
  });
  assert.equal(draftCancel.releasedCapacity, false);
  const unchanged = await timeSlots.findById(tenant, slotId);
  assert(unchanged.ok && unchanged.value?.remaining === 1);
});

test('TST-212 枠の定員と予約済み数の不変条件を復元時と返却時に検証する', async () => {
  const { tenant, slotId } = await fixture();
  assert(!TimeSlot.create(slotId, tenant, 0).ok);
  const broken = TimeSlot.restore(slotId, tenant, 1, 2);
  assert(!broken.ok && broken.error.code === 'TIME_SLOT_CAPACITY_INVALID');
  const slot = TimeSlot.create(slotId, tenant, 1);
  assert(slot.ok);
  const released = slot.value.release();
  assert(!released.ok && released.error.code === 'TIME_SLOT_NOT_RESERVED');
  assert(slot.value.reserve().ok);
  assert(!slot.value.reserve().ok);
  assert.equal(slot.value.remaining, 0);
});

test('TST-213 イベント配信の失敗は呼び出し元へ伝わる', async () => {
  const { tenant, id, slotId, reservations, timeSlots } = await fixture();
  const create = new CreateReservationUseCase(
    reservations,
    timeSlots,
    { publish: async () => err(new DomainError('SAMPLE_PUBLISH_FAILED', '配信失敗')) },
    () => now,
  );
  await assert.rejects(
    create.execute({
      tenantId: tenant.value,
      reservationId: id.value,
      timeSlotId: slotId.value,
    }),
    (error: unknown) =>
      error instanceof ConflictError && error.details?.code === 'SAMPLE_PUBLISH_FAILED',
  );
  // 配信前の保存は成功しているため、予約は残る (補償は未実装。RSK-101)。
  const stored = await reservations.findById(tenant, id);
  assert(stored.ok && stored.value?.status === 'draft');
});
