import { Result } from '@/shared/kernel/result';
import { TenantId } from '@/shared/kernel/tenant-id';
import { Reservation } from '@/modules/booking/domain/reservation';
import { ReservationId } from '@/modules/booking/domain/value-objects/reservation-id';

/**
 * ドメイン語彙のメソッドだけを公開する。Prisma の型 (Prisma.*, PrismaClient, 生成 model) を
 * 引数・戻り値・例外に一切出さない。出した瞬間に「Postgres を差し替えられる」は嘘になる。
 */
export interface ReservationRepositoryPort {
  findById(tenantId: TenantId, id: ReservationId): Promise<Result<Reservation | null>>;
  save(tenantId: TenantId, aggregate: Reservation): Promise<Result<void>>;
}

/** DI トークン。port と同じファイルに置き、application は adapter を知らないまま注入を受ける。 */
export const RESERVATION_REPOSITORY = Symbol('ReservationRepositoryPort');
