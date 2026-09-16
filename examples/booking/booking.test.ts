import assert from 'node:assert/strict';
import test from 'node:test';
import { CreateReservationUseCase } from '@/modules/booking/application/use-cases/create-reservation.use-case';
import { Reservation } from '@/modules/booking/domain/reservation';
import { ReservationId } from '@/modules/booking/domain/value-objects/reservation-id';
import { InMemoryReservationRepository } from '@/modules/booking/infrastructure/in-memory-reservation.repository';
import { ValidationError, ConflictError } from '@/shared/kernel/app-error';
import { DomainError, err } from '@/shared/kernel/result';
import { TenantId } from '@/shared/kernel/tenant-id';

const now = new Date('2026-09-16T00:00:00Z');
function fixture() {
  const tenant = TenantId.create('sample-outdoor');
  const other = TenantId.create('sample-other');
  const id = ReservationId.create('reservation-001');
  assert(tenant.ok && other.ok && id.ok);
  const repository = new InMemoryReservationRepository();
  return { tenant: tenant.value, other: other.value, id: id.value, repository,
    create: new CreateReservationUseCase(repository, () => now) };
}

test('TST-201 作成した予約は draft で保存され、別テナントには見えない', async () => {
  const { tenant, other, id, repository, create } = fixture();
  assert.deepEqual(await create.execute({ tenantId: tenant.value, reservationId: id.value }),
    { reservationId: id.value, status: 'draft' });
  const saved = await repository.findById(tenant, id);
  assert(saved.ok && saved.value?.status === 'draft');
  assert.deepEqual(await repository.findById(other, id), { ok: true, value: null });
});

test('TST-202 確定→キャンセル後の再確定は失敗し、状態を変えない', () => {
  const { tenant, id } = fixture();
  const reservation = Reservation.create(id, tenant, now);
  assert(reservation.transitionTo('confirmed').ok);
  assert(reservation.transitionTo('cancelled').ok);
  const result = reservation.transitionTo('confirmed');
  assert(!result.ok && result.error.code === 'RESERVATION_TRANSITION_FORBIDDEN');
  assert.equal(reservation.status, 'cancelled');
});

test('TST-203 作成イベントにはテナント・ID・注入時刻が入り、一度だけ取り出せる', () => {
  const { tenant, id } = fixture();
  const reservation = Reservation.create(id, tenant, now);
  const events = reservation.pullEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'booking.reservation.created');
  assert.equal(events[0].tenantId, tenant.value);
  assert.equal(events[0].occurredAt, now);
  assert.deepEqual(events[0].payload, { reservationId: id.value });
  assert.deepEqual(reservation.pullEvents(), []);
});

test('TST-204 不正な入力は 400 相当となり、保存しない', async () => {
  let saves = 0;
  const create = new CreateReservationUseCase({
    findById: async () => { throw new Error('unexpected read'); },
    save: async () => { saves++; throw new Error('unexpected save'); },
  }, () => now);
  for (const input of [
    { tenantId: '', reservationId: 'reservation-001' },
    { tenantId: 'sample-outdoor', reservationId: '!' },
  ]) {
    await assert.rejects(create.execute(input), (error: unknown) =>
      error instanceof ValidationError && error.statusCode === 400);
  }
  assert.equal(saves, 0);
});

test('TST-205 repository の業務エラーは application が 409 相当に変換する', async () => {
  const create = new CreateReservationUseCase({
    findById: async () => { throw new Error('unexpected read'); },
    save: async () => err(new DomainError('SAMPLE_CONFLICT', '保存競合')),
  }, () => now);
  await assert.rejects(create.execute({ tenantId: 'sample-outdoor', reservationId: 'reservation-001' }),
    (error: unknown) => error instanceof ConflictError && error.statusCode === 409 &&
      error.details?.code === 'SAMPLE_CONFLICT');
});

test('TST-206 越境保存を拒否し、同じ ID を持つ別テナントの予約を分離する', async () => {
  const { tenant, other, id, repository } = fixture();
  const reservation = Reservation.create(id, tenant, now);
  const denied = await repository.save(other, reservation);
  assert(!denied.ok && denied.error.code === 'TENANT_MISMATCH');
  assert.deepEqual(await repository.findById(other, id), { ok: true, value: null });
  assert((await repository.save(tenant, reservation)).ok);
  const second = Reservation.create(id, other, now);
  assert(second.transitionTo('confirmed').ok);
  assert((await repository.save(other, second)).ok);
  const firstRead = await repository.findById(tenant, id);
  const secondRead = await repository.findById(other, id);
  assert(firstRead.ok && firstRead.value?.status === 'draft');
  assert(secondRead.ok && secondRead.value?.status === 'confirmed');
});

test('TST-207 取得後に状態を変えても save するまで保存済みデータは変わらない', async () => {
  const { tenant, id, repository, create } = fixture();
  await create.execute({ tenantId: tenant.value, reservationId: id.value });
  const read = await repository.findById(tenant, id);
  assert(read.ok && read.value);
  assert(read.value.transitionTo('confirmed').ok);
  const beforeSave = await repository.findById(tenant, id);
  assert(beforeSave.ok && beforeSave.value?.status === 'draft');
  assert((await repository.save(tenant, read.value)).ok);
  const afterSave = await repository.findById(tenant, id);
  assert(afterSave.ok && afterSave.value?.status === 'confirmed');
});
