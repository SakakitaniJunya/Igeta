import { Provider } from '@nestjs/common';
import { CLOCK, ClockPort } from '@/shared/kernel/clock.port';
import { PrismaService } from '@/common/prisma/prisma.service';
import { Create__Aggregate__UseCase } from '@/modules/__context__/application/use-cases/create-__aggregate__.use-case';
import {
  __AGGREGATE___REPOSITORY,
  __Aggregate__RepositoryPort,
} from '@/modules/__context__/domain/ports/__aggregate__.repository.port';
import { Prisma__Aggregate__Repository } from '@/modules/__context__/infrastructure/adapters/prisma-__aggregate__.repository';

/**
 * port → adapter の束ね。差し替えたいときに触るのはこの 1 ファイルだけ。
 * useFactory を使うのは application 層を NestJS 非依存 (素のクラス) に保つため。
 */
export const __contextCamel__Providers: Provider[] = [
  PrismaService,
  {
    provide: __AGGREGATE___REPOSITORY,
    useClass: Prisma__Aggregate__Repository,
  },
  {
    provide: CLOCK,
    useValue: { now: () => new Date() } satisfies ClockPort,
  },
  {
    provide: Create__Aggregate__UseCase,
    useFactory: (repository: __Aggregate__RepositoryPort, clock: ClockPort) =>
      new Create__Aggregate__UseCase(repository, () => clock.now()),
    inject: [__AGGREGATE___REPOSITORY, CLOCK],
  },
];
