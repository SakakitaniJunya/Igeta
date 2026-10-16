// __context__ コンテキストの公開面。他のコンテキストとエントリは、このファイルだけを通して使う
// (cross-module-through-index-only)。ここに置いてよいのは、組み立て (create__Context__Module)・公開の型・DTO・ドメインイベントだけ。

import type { Firestore } from '@google-cloud/firestore';
import type { HttpResponse } from '../../shared/http/response.js';
import { Close__Aggregate__UseCase } from './application/close-__aggregate__.usecase.js';
import { Firestore__Aggregate__Repository } from './infrastructure/firestore-__aggregate__.repository.js';
import { FirestoreTransactionRunner } from './infrastructure/firestore-transaction-runner.js';
import { handleClose__Aggregate__ } from './presentation/__aggregate__.controller.js';

/** 入口 (Hono のルート) から呼ぶ関数の表。値を受け取り HttpResponse を返す。 */
export interface __Context__Module {
  readonly close__Aggregate__: (id: string) => Promise<HttpResponse>;
}

/** 依存を組み立てる。呼ぶのは backend/src/index.ts (エントリ) だけ。 */
export function create__Context__Module(db: Firestore): __Context__Module {
  const close = new Close__Aggregate__UseCase(new Firestore__Aggregate__Repository(db), new FirestoreTransactionRunner(db));
  return {
    close__Aggregate__: (id) => handleClose__Aggregate__(close, id),
  };
}
