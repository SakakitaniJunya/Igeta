import { Injectable } from '@nestjs/common';
import { DomainError, Result, err, ok } from '@/shared/kernel/result';
import { TenantId } from '@/shared/kernel/tenant-id';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  OCCUPANCY_CONFLICT,
  TenantTx,
  isExclusionViolation,
  withTenant,
} from '@/common/prisma/tenant-transaction';
import { __Aggregate__, __Aggregate__Status } from '@/modules/__context__/domain/__aggregate__';
import { __Aggregate__RepositoryPort } from '@/modules/__context__/domain/ports/__aggregate__.repository.port';
import { __Aggregate__Id } from '@/modules/__context__/domain/value-objects/__aggregate__-id';

/**
 * 公開メソッドはドメイン語彙だけ。Prisma の型は private の内側から出さない。
 * 全クエリは withTenant() のトランザクション内で実行する — RLS が `app.tenant_id` を
 * 見るため、これを経由しないクエリは 0 件になる。
 */
@Injectable()
export class Prisma__Aggregate__Repository implements __Aggregate__RepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(tenantId: TenantId, id: __Aggregate__Id): Promise<Result<__Aggregate__ | null>> {
    const row = await withTenant(this.prisma, tenantId, (tx) => this.selectById(tx, id.value));
    if (row === null) return ok(null);
    return ok(__Aggregate__.restore(id, tenantId, row.status as __Aggregate__Status));
  }

  async save(tenantId: TenantId, aggregate: __Aggregate__): Promise<Result<void>> {
    try {
      await withTenant(this.prisma, tenantId, (tx) => this.upsert(tx, tenantId, aggregate));
      return ok(undefined);
    } catch (error) {
      // 排他制約 (EXCLUDE USING GIST) 違反はドメインエラーへ翻訳する。
      // SQLSTATE を上位層に見せない = 上位層が Postgres を知らない状態を保つ。
      if (isExclusionViolation(error)) return err(OCCUPANCY_CONFLICT);
      if (error instanceof Error) {
        return err(new DomainError('__AGGREGATE___PERSISTENCE_FAILED', error.message));
      }
      throw error;
    }
  }

  // --- 以下 private: Prisma / SQL の語彙はこの境界より外に出さない ---

  private async selectById(tx: TenantTx, id: string): Promise<{ status: string } | null> {
    return tx.__aggregateCamel__.findUnique({ where: { id }, select: { status: true } });
  }

  private async upsert(
    tx: TenantTx,
    tenantId: TenantId,
    aggregate: __Aggregate__,
  ): Promise<void> {
    const data = {
      tenantId: tenantId.value,
      status: aggregate.status,
    };
    await tx.__aggregateCamel__.upsert({
      where: { id: aggregate.id.value },
      create: { id: aggregate.id.value, ...data },
      update: data,
    });
  }
}
