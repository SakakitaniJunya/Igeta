// RLS 前提: アプリは全クエリを `app.tenant_id` を張ったトランザクション内で実行する。
// SET LOCAL はパラメータを取れないため set_config(..., is_local = true) を使う。
// この関数を経由しないクエリは RLS ポリシーにより 0 件を返す (= 事故が握り潰されない)。

import { Prisma } from '@prisma/client';
import { DomainError } from '@/shared/kernel/result';
import { TenantId } from '@/shared/kernel/tenant-id';
import { PrismaService } from '@/common/prisma/prisma.service';

export type TenantTx = Prisma.TransactionClient;

export async function withTenant<T>(
  prisma: PrismaService,
  tenantId: TenantId,
  work: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId.value}, true)`;
    return work(tx);
  });
}

/** PostgreSQL の排他制約違反 (SQLSTATE 23P01)。占有区間の重なりはここでしか検出しない。 */
export function isExclusionViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const code = (error.meta as { code?: string } | undefined)?.code;
    if (code === '23P01') return true;
  }
  return error instanceof Error && error.message.includes('23P01');
}

export const OCCUPANCY_CONFLICT = new DomainError(
  'SLOT_ALREADY_TAKEN',
  '指定区間はすでに占有されている',
);
