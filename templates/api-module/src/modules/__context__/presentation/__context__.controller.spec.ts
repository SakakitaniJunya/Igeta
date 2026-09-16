import { describe, expect, it, vi } from 'vitest';
import { Create__Aggregate__UseCase } from '@/modules/__context__/application/use-cases/create-__aggregate__.use-case';
import { __Context__Controller } from '@/modules/__context__/presentation/__context__.controller';

describe('__Context__Controller', () => {
  it('テナントは引数から受け取り、body からは受け取らない', async () => {
    const execute = vi.fn(async () => ({ __aggregateCamel__Id: '01hq2m9k3v', status: 'draft' }));
    const useCase = { execute } as unknown as Create__Aggregate__UseCase;
    const controller = new __Context__Controller(useCase);

    const response = await controller.create('tenant-001', { __aggregateCamel__Id: '01hq2m9k3v' });

    expect(execute).toHaveBeenCalledWith({ tenantId: 'tenant-001', __aggregateCamel__Id: '01hq2m9k3v' });
    expect(response.id).toBe('01hq2m9k3v');
  });
});
