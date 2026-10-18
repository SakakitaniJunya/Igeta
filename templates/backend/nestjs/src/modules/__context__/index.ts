// __context__ コンテキストの公開面。他のコンテキストと入口は、このファイルだけを通して使う
// (cross-module-through-index-only・entries-go-through-module-index)。
// ここに置いてよいのは、組み立て (create__Context__Module)・公開の型・DTO・ドメインイベントだけ。

import { randomUUID } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import type { HttpResponse } from '@/shared/presentation/response.js';
import { Close__Aggregate__UseCase } from './application/close-__aggregate__.usecase.js';
import { Create__Aggregate__UseCase } from './application/create-__aggregate__.usecase.js';
import { LIST_LIMIT, List__Aggregate__ItemsUseCase } from './application/list-__aggregates__.usecase.js';
import { Firestore__Aggregate__Repository } from './infrastructure/firestore-__aggregate__.repository.js';
import { FirestoreTransactionRunner } from './infrastructure/firestore-transaction-runner.js';
import { handleClose__Aggregate__, handleCreate__Aggregate__, handleList__Aggregate__Items } from './presentation/__aggregate__.controller.js';

/**
 * 入口 (Hono のルート) から呼ぶ関数の表。入口は検証せず、本文・id・query を unknown のまま渡す。
 * 形の検証はこの中の controller (zod) が行い、HttpResponse を返す。
 */
export interface __Context__Module {
  readonly list__Aggregate__Items: (query: unknown) => Promise<HttpResponse>;
  readonly create__Aggregate__: (body: unknown) => Promise<HttpResponse>;
  readonly close__Aggregate__: (id: unknown) => Promise<HttpResponse>;
}

/** 依存を組み立てる。呼ぶのは backend/src/index.ts (組み立ての場所) だけ。 */
export function create__Context__Module(db: Firestore): __Context__Module {
  const repository = new Firestore__Aggregate__Repository(db);
  const runner = new FirestoreTransactionRunner(db);
  const list = new List__Aggregate__ItemsUseCase(repository, LIST_LIMIT);
  const create = new Create__Aggregate__UseCase(repository, runner, randomUUID);
  const close = new Close__Aggregate__UseCase(repository, runner);
  return {
    list__Aggregate__Items: (query) => handleList__Aggregate__Items(list, query),
    create__Aggregate__: (body) => handleCreate__Aggregate__(create, body),
    close__Aggregate__: (id) => handleClose__Aggregate__(close, id),
  };
}
