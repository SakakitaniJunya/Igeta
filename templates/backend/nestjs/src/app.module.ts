// ルートの Nest module。土台は database と health だけを束ねる。module も入口も登録しない。
//
// 入口を足すとき (展開したあと、この 2 か所に足す):
//   1. imports に `__Entry__EntryModule.register({ verify })` を 1 行足す。
//   2. verify (トークン・署名を確かめる関数) をここで作って渡す。作り方は利用 repo ごとに違う。

import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/entries/database/database.module.js';
import { HealthController } from '@/entries/http/health.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
})
export class AppModule {}
