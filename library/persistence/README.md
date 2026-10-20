# @igeta/persistence

DB 層の部品 (Result・AppError・Repository の port・Mapper・Transaction、Firestore と Postgres の実装、契約テスト、InMemory 実装)。0.1.0 (未公開)。

## 入れ方

```sh
npm install @igeta/persistence
npm install @google-cloud/firestore   # Firestore を使う場合
npm install kysely pg                 # Postgres を使う場合
npm install -D vitest                 # 契約テストを使う場合
```

## 入口

| 入口 | 中身 | 要る SDK |
|---|---|---|
| `@igeta/persistence` | Result・AppError・Repository・Mapper・TransactionRunner・DocumentId・ListQuery・IdGenerator | なし |
| `@igeta/persistence/testing` | describeRepositoryContract・InMemoryStore・InMemoryRepository・InMemoryTransactionRunner | vitest |
| `@igeta/persistence/firestore` | FirestoreRepository・FirestoreTransactionRunner・createFirestore | @google-cloud/firestore |
| `@igeta/persistence/postgres` | SqlRepository・SqlTransactionRunner・createPostgres・migrateToLatest ([docs/postgres.md](docs/postgres.md)) | kysely・pg |

## 使い方 (集約 1 つ: memo、InMemory)

```ts
import { createUuidGenerator, err, ok, unprocessable } from '@igeta/persistence';
import type { Mapper } from '@igeta/persistence';
import { InMemoryRepository, InMemoryStore, InMemoryTransactionRunner } from '@igeta/persistence/testing';

interface Memo { readonly id: string; readonly title: string; readonly state: 'draft' | 'published' }
interface MemoRecord { readonly title: string; readonly state: string }

// 保存の形と entity の変換。保存データが不正なら err を返す (読み出しは unprocessable になる)
const memoMapper: Mapper<Memo, MemoRecord> = {
  toRecord: ({ title, state }) => ({ title, state }),
  fromRecord: (id, { title, state }) =>
    typeof title === 'string' && title.length <= 40 && (state === 'draft' || state === 'published')
      ? ok({ id, title, state })
      : err(unprocessable('memo が不正')),
};

const store = new InMemoryStore<MemoRecord>();
const memos = new InMemoryRepository({
  store,
  mapper: memoMapper,
  filterFields: (filter: { state?: Memo['state'] }) => ({ state: filter.state }), // 絞り込みの値を保存の項目へ写す。undefined は絞らない
});
const runner = new InMemoryTransactionRunner(store);

await runner.run((scope) => memos.save({ id: 'm-1', title: 'はじめ', state: 'draft' }, scope));
const page = await memos.list({ filter: { state: 'draft' }, limit: 20 }); // page.isTruncated: 続きがあれば true
```

## Firestore の使い方

Mapper と絞り込みの写し方は上と同じ。`InMemoryStore` の代わりに Firestore を渡す。

```ts
import { createFirestore, FirestoreRepository, FirestoreTransactionRunner } from '@igeta/persistence/firestore';

const db = createFirestore('my-project');
const memos = new FirestoreRepository({
  db,
  collection: 'memos',
  mapper: memoMapper,
  filterFields: (filter: { state?: Memo['state'] }) => ({ state: filter.state }),
});
const runner = new FirestoreTransactionRunner(db);

await runner.run((scope) => memos.save({ id: 'm-1', title: 'はじめ', state: 'draft' }, scope));
const page = await memos.list({ filter: { state: 'draft' }, limit: 20 });
```

## Postgres の使い方

table の型 (`Database`) は自分で書き、`createPostgres` に渡す。詳しくは [docs/postgres.md](docs/postgres.md)。

```ts
import { createPostgres, migrateToLatest, SqlRepository, SqlTransactionRunner } from '@igeta/persistence/postgres';

interface Database { memos: { id: string; title: string; state: string } }

const database = createPostgres<Database>(process.env.PG_URL ?? '');
await migrateToLatest(database, {
  '0001-memos': {
    up: async (db) => {
      await db.schema.createTable('memos')
        .addColumn('id', 'text', (column) => column.primaryKey())
        .addColumn('title', 'text')
        .addColumn('state', 'text')
        .execute();
    },
  },
});
const memos = new SqlRepository({
  db: database,
  table: 'memos',
  mapper: memoMapper,
  filterFields: (filter: { state?: Memo['state'] }) => ({ state: filter.state }),
});
const runner = new SqlTransactionRunner(database);

await runner.run((scope) => memos.save({ id: 'm-1', title: 'はじめ', state: 'draft' }, scope));
const page = await memos.list({ filter: { state: 'draft' }, limit: 20 });
```

## 契約テスト

自分の repository を契約 C1〜C10 に通す。vitest のテストファイルに書く。次は InMemory の例で、Firestore・Postgres も `repository`・`runner`・`remove` を差し替えるだけで同じ。

```ts
import { describeRepositoryContract } from '@igeta/persistence/testing';

const idGenerator = createUuidGenerator();

describeRepositoryContract({
  name: 'memos (InMemory)',
  setup: () => ({ repository: memos, runner, newId: () => idGenerator.next(), remove: (id) => store.remove(id) }),
  malformedKinds: [],
  fixtures: {
    createEntity: (id, state) => ({ id, title: state === 'draft' ? '下書き' : '公開', state }),
    filterByState: (state) => ({ state }),
    isSameContent: (left, right) => left.title === right.title && left.state === right.state,
  },
});
```

- `setup` は契約の最初に 1 回だけ呼ぶ。`newId` の id だけを使い、`remove(id)` で最後に全部消す (無い id を消しても失敗しない)。`close` があれば最後に呼ぶ
- `malformedKinds` は壊れた保存データの種類で、1 種類につき C9 の 1 行を登録する。種類を書くなら `setup` に `plantMalformed(kind, id)` (壊れた保存データを生で置く) も返す。空なら C9 は表から外れる
- id は `[A-Za-z0-9_-]` の 1〜64 字で、`__` で始まり `__` で終わる形は使えない

## 開発と版

```sh
npm test                 # unit (emulator・Postgres が無い suite は飛ばす)
npm run test:firestore   # firebase emulators:exec で Firestore emulator を立てて走らせる (Java が要る)
PG_URL=postgres://… npm run test:postgres   # Postgres 16 が要る
```

`REQUIRE_EMULATOR=1`・`REQUIRE_POSTGRES=1` を付けると、環境が無いときに飛ばさず落ちる (上の 2 つの script は付けてある)。

semver。1.0.0 までは破壊的変更を minor で入れ、CHANGELOG.md に書く。
