import { Module } from '@nestjs/common';
import { __contextCamel__Providers } from '@/modules/__context__/infrastructure/__context__.providers';
import { __Context__Controller } from '@/modules/__context__/presentation/__context__.controller';
import { Create__Aggregate__UseCase } from '@/modules/__context__/application/use-cases/create-__aggregate__.use-case';

/**
 * 境界づけられたコンテキスト = この module。
 * exports に出してよいのは application service と DTO / domain event だけ。
 * repository / entity を exports に足した時点で境界が壊れる。
 */
@Module({
  controllers: [__Context__Controller],
  providers: [...__contextCamel__Providers],
  exports: [Create__Aggregate__UseCase],
})
export class __Context__Module {}
