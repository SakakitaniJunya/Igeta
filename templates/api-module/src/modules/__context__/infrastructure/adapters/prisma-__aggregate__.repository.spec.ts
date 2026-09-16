import { describe, expect, it, vi } from 'vitest';
import { TenantId } from '@/shared/kernel/tenant-id';
import { PrismaService } from '@/common/prisma/prisma.service';
import { __Aggregate__ } from '@/modules/__context__/domain/__aggregate__';
import { __Aggregate__Id } from '@/modules/__context__/domain/value-objects/__aggregate__-id';
import { Prisma__Aggregate__Repository } from '@/modules/__context__/infrastructure/adapters/prisma-__aggregate__.repository';

// 結合テスト (実 Postgres + RLS + EXCLUDE) は *.int.spec.ts に置き、
// testcontainers で起動した Cloud SQL 同等のイメージに対して実行する。
// 本ファイルは「SQLSTATE をドメインエラーへ翻訳する」変換規約だけを検証する。

const tenant = (): TenantId => {
  const result = TenantId.create('tenant-001');
  if (!result.ok) throw new Error('fixture invalid');
  return result.value;
};

const aggregateId = (): __Aggregate__Id => {
  const result = __Aggregate__Id.create('01hq2m9k3v');
  if (!result.ok) throw new Error('fixture invalid');
  return result.value;
};

describe('Prisma__Aggregate__Repository', () => {
  it('排他制約違反 (23P01) を SLOT_ALREADY_TAKEN に翻訳する', async () => {
    const prisma = {
      $transaction: vi.fn(async () => {
        throw new Error('ERROR: conflicting key value violates exclusion constraint (23P01)');
      }),
    } as unknown as PrismaService;

    const repository = new Prisma__Aggregate__Repository(prisma);
    const result = await repository.save(
      tenant(),
      __Aggregate__.create(aggregateId(), tenant(), new Date()),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SLOT_ALREADY_TAKEN');
  });
});
