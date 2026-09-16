import assert from 'node:assert/strict';
import { CreateReservationUseCase } from '@/modules/booking/application/use-cases/create-reservation.use-case';
import { ReservationId } from '@/modules/booking/domain/value-objects/reservation-id';
import { InMemoryReservationRepository } from '@/modules/booking/infrastructure/in-memory-reservation.repository';
import { TenantId } from '@/shared/kernel/tenant-id';

const repository = new InMemoryReservationRepository();
const create = new CreateReservationUseCase(repository, () => new Date('2026-09-16T00:00:00Z'));
const created = await create.execute({ tenantId: 'sample-outdoor', reservationId: 'reservation-001' });
console.log('1. 予約作成:', JSON.stringify(created));

const tenant = TenantId.create('sample-outdoor');
const otherTenant = TenantId.create('sample-other');
const id = ReservationId.create(created.reservationId);
assert(tenant.ok && otherTenant.ok && id.ok);
const found = await repository.findById(tenant.value, id.value);
assert(found.ok && found.value);
const reservation = found.value;
assert(reservation.transitionTo('confirmed').ok);
console.log('2. 予約確定:', reservation.status);
assert(reservation.transitionTo('cancelled').ok);
assert((await repository.save(tenant.value, reservation)).ok);
console.log('3. キャンセル:', reservation.status);

const forbidden = reservation.transitionTo('confirmed');
assert(!forbidden.ok);
console.log('4. 再確定を拒否:', forbidden.error.code);
const hidden = await repository.findById(otherTenant.value, id.value);
assert(hidden.ok && hidden.value === null);
console.log('5. 別テナントからの取得:', hidden.value);
console.log('サンプル完了（保存先はメモリのみ）');
