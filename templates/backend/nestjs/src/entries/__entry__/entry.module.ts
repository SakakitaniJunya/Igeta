// 入口の Nest module。controller・Guard と、module の公開面を作る provider をまとめる。
// 検証関数 (verify) は利用 repo の app.module.ts が作って register に渡す。
// Firestore は DatabaseModule (@Global) の FIRESTORE を注入する。

import { Module, type DynamicModule } from '@nestjs/common';
import { create__Context__Module } from '@/modules/__context__/index.js';
import { FIRESTORE } from '@/entries/database/database.module.js';
import { __Context__ModuleToken, __Entry__Controller } from '@/entries/__entry__/controller.js';
import { VERIFIER, __Entry__Guard, type __Entry__Verifier } from '@/entries/__entry__/guard.js';

export interface __Entry__EntryModuleOptions {
  readonly verify: __Entry__Verifier;
}

@Module({})
export class __Entry__EntryModule {
  static register(options: __Entry__EntryModuleOptions): DynamicModule {
    return {
      module: __Entry__EntryModule,
      controllers: [__Entry__Controller],
      providers: [
        __Entry__Guard,
        { provide: VERIFIER, useValue: options.verify },
        {
          provide: __Context__ModuleToken,
          // Firestore の型は entries では import できないので、module の組み立て関数の引数から取る。
          useFactory: (db: Parameters<typeof create__Context__Module>[0]) => create__Context__Module(db),
          inject: [FIRESTORE],
        },
      ],
    };
  }
}
