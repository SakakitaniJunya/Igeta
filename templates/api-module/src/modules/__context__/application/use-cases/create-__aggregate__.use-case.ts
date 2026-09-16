import { AppError, NotFoundError, ValidationError, toAppError } from '@/shared/kernel/app-error';
import { TenantId } from '@/shared/kernel/tenant-id';
import {
  Create__Aggregate__Input,
  Create__Aggregate__Output,
} from '@/modules/__context__/application/dto/create-__aggregate__.dto';
import { __Aggregate__ } from '@/modules/__context__/domain/__aggregate__';
import { __Aggregate__RepositoryPort } from '@/modules/__context__/domain/ports/__aggregate__.repository.port';
import { __Aggregate__Id } from '@/modules/__context__/domain/value-objects/__aggregate__-id';

/**
 * application 層は NestJS に依存しない素のクラス。
 * 配線は infrastructure/__context__.providers.ts の useFactory が行う
 * (@nestjs/* の import は dependency-cruiser で禁止)。
 * ドメインの Result はここで AppError に変換して throw する (二層エラー戦略)。
 */
export class Create__Aggregate__UseCase {
  constructor(
    private readonly repository: __Aggregate__RepositoryPort,
    private readonly now: () => Date,
  ) {}

  async execute(input: Create__Aggregate__Input): Promise<Create__Aggregate__Output> {
    const tenantId = TenantId.create(input.tenantId);
    if (!tenantId.ok) throw new ValidationError(tenantId.error.message, tenantId.error.details);

    const id = __Aggregate__Id.create(input.__aggregateCamel__Id);
    if (!id.ok) throw new ValidationError(id.error.message, id.error.details);

    const aggregate = __Aggregate__.create(id.value, tenantId.value, this.now());

    const saved = await this.repository.save(tenantId.value, aggregate);
    if (!saved.ok) throw this.toHttpError(saved.error.code, toAppError(saved.error));

    return { __aggregateCamel__Id: aggregate.id.value, status: aggregate.status };
  }

  private toHttpError(code: string, fallback: AppError): AppError {
    return code === '__AGGREGATE___NOT_FOUND' ? new NotFoundError(fallback.message) : fallback;
  }
}
