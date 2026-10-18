// ルートの Nest module。土台は database と health だけを束ねる。module も入口も登録しない。
//
// 入口を足すとき (展開したあと、`@igeta:register-*` の目印の上に足す。目印は消さない):
//   1. imports に `<Entry>EntryModule.register({ verify })` を 1 行足す。
//   2. verify (トークン・署名を確かめる関数) をここで作って渡す。作り方は利用 repo ごとに違う。

import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/entries/database/database.module.js';
import { HealthController } from '@/entries/http/health.controller.js';
// @igeta:register-import

// @igeta:register-verify

@Module({
  imports: [
    DatabaseModule,
    // @igeta:register-entry
  ],
  controllers: [HealthController],
})
export class AppModule {}
