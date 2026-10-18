// __context__ の公開面。入口 (entries) と他の module は、このファイルだけを通して使う。
// ここに置いてよいのは、組み立て (create__Context__Module)・公開の型だけ。Nest は知らない。

import { randomUUID } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import type { HttpResponse } from '@/shared/presentation/response.js';
import { Close__Aggregate__UseCase } from '@/modules/__context__/application/close-__aggregate__.usecase.js';
import { Create__Aggregate__UseCase } from '@/modules/__context__/application/create-__aggregate__.usecase.js';
import { List__Aggregate__ItemsUseCase } from '@/modules/__context__/application/list-__aggregates__.usecase.js';
import { Firestore__Aggregate__Repository } from '@/modules/__context__/infrastructure/firestore-__aggregate__.repository.js';
import { FirestoreTransactionRunner } from '@/modules/__context__/infrastructure/firestore-transaction-runner.js';
import { __Aggregate__Controller } from '@/modules/__context__/presentation/__aggregate__.controller.js';

/** 入口の controller から呼ぶ関数の表。HTTP から取り出した値 (unknown) を受け取り、HttpResponse を返す。 */
export interface __Context__Module {
  readonly list__Aggregate__Items: (query: unknown) => Promise<HttpResponse>;
  readonly create__Aggregate__: (body: unknown) => Promise<HttpResponse>;
  readonly close__Aggregate__: (id: unknown) => Promise<HttpResponse>;
}

/** 依存を組み立てる。呼ぶのは入口の Nest module (entries/<入口>/) の provider だけ。 */
export function create__Context__Module(db: Firestore): __Context__Module {
  const repository = new Firestore__Aggregate__Repository(db);
  const runner = new FirestoreTransactionRunner(db);
  const controller = new __Aggregate__Controller({
    list: new List__Aggregate__ItemsUseCase(repository),
    create: new Create__Aggregate__UseCase(repository, runner, randomUUID),
    close: new Close__Aggregate__UseCase(repository, runner),
  });
  return {
    list__Aggregate__Items: (query) => controller.list(query),
    create__Aggregate__: (body) => controller.create(body),
    close__Aggregate__: (id) => controller.close(id),
  };
}
