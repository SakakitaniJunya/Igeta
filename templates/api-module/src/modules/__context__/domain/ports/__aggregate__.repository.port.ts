import { Result } from '@/shared/kernel/result';
import { TenantId } from '@/shared/kernel/tenant-id';
import { __Aggregate__ } from '@/modules/__context__/domain/__aggregate__';
import { __Aggregate__Id } from '@/modules/__context__/domain/value-objects/__aggregate__-id';

/**
 * ドメイン語彙のメソッドだけを公開する。Prisma の型 (Prisma.*, PrismaClient, 生成 model) を
 * 引数・戻り値・例外に一切出さない。出した瞬間に「Postgres を差し替えられる」は嘘になる。
 */
export interface __Aggregate__RepositoryPort {
  findById(tenantId: TenantId, id: __Aggregate__Id): Promise<Result<__Aggregate__ | null>>;
  save(tenantId: TenantId, aggregate: __Aggregate__): Promise<Result<void>>;
}

/** DI トークン。port と同じファイルに置き、application は adapter を知らないまま注入を受ける。 */
export const __AGGREGATE___REPOSITORY = Symbol('__Aggregate__RepositoryPort');
