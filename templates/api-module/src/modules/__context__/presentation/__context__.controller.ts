import { Body, Controller, Post } from '@nestjs/common';
import type { components } from '@app/api-contract';
import { TenantContext } from '@/common/tenancy/tenant-context.decorator';
import { Create__Aggregate__UseCase } from '@/modules/__context__/application/use-cases/create-__aggregate__.use-case';

// 型は必ず api-contract の生成物から取る。ここで型を手書きすると OpenAPI が SoT でなくなる。
type Create__Aggregate__Request = components['schemas']['Create__Aggregate__Request'];
type __Aggregate__Response = components['schemas']['__Aggregate__'];

@Controller('v1/__context__/__aggregate__s')
export class __Context__Controller {
  constructor(private readonly create__Aggregate__: Create__Aggregate__UseCase) {}

  @Post()
  async create(
    @TenantContext() tenantId: string,
    @Body() body: Create__Aggregate__Request,
  ): Promise<__Aggregate__Response> {
    const output = await this.create__Aggregate__.execute({
      tenantId,
      __aggregateCamel__Id: body.__aggregateCamel__Id,
    });
    return { id: output.__aggregateCamel__Id, status: output.status } as __Aggregate__Response;
  }
}
