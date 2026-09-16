import { describe, expect, it } from 'vitest';
import { DomainError, Result, err, ok } from '@/shared/kernel/result';
import { TenantId } from '@/shared/kernel/tenant-id';
import { Create__Aggregate__UseCase } from '@/modules/__context__/application/use-cases/create-__aggregate__.use-case';
import { __Aggregate__ } from '@/modules/__context__/domain/__aggregate__';
import { __Aggregate__RepositoryPort } from '@/modules/__context__/domain/ports/__aggregate__.repository.port';

// port の手書きスタブ。DB を立てずに application を検証できることが port の存在理由。
class Stub__Aggregate__Repository implements __Aggregate__RepositoryPort {
  readonly saved: __Aggregate__[] = [];
  constructor(private readonly failure?: DomainError) {}

  async findById(): Promise<Result<__Aggregate__ | null>> {
    return ok(null);
  }

  async save(_tenantId: TenantId, aggregate: __Aggregate__): Promise<Result<void>> {
    if (this.failure) return err(this.failure);
    this.saved.push(aggregate);
    return ok(undefined);
  }
}

const NOW = (): Date => new Date('2026-09-16T00:00:00Z');

describe('Create__Aggregate__UseCase', () => {
  it('保存に成功すると id と status を返す', async () => {
    const repository = new Stub__Aggregate__Repository();
    const useCase = new Create__Aggregate__UseCase(repository, NOW);
    const output = await useCase.execute({ tenantId: 'tenant-001', __aggregateCamel__Id: '01hq2m9k3v' });
    expect(output.status).toBe('draft');
    expect(repository.saved).toHaveLength(1);
  });

  it('tenantId が不正なら ValidationError (400)', async () => {
    const useCase = new Create__Aggregate__UseCase(new Stub__Aggregate__Repository(), NOW);
    await expect(
      useCase.execute({ tenantId: 'A', __aggregateCamel__Id: '01hq2m9k3v' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('ドメインエラーは AppError へ変換して throw する', async () => {
    const repository = new Stub__Aggregate__Repository(new DomainError('SLOT_ALREADY_TAKEN', '衝突'));
    const useCase = new Create__Aggregate__UseCase(repository, NOW);
    await expect(
      useCase.execute({ tenantId: 'tenant-001', __aggregateCamel__Id: '01hq2m9k3v' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
