# @igeta/persistence

DB 層の部品 (Result・AppError・Repository の port・Mapper・Transaction、Firestore と Postgres の実装、契約テスト)。0.1.0 (未公開)。

## 入れ方

```sh
npm install @igeta/persistence @google-cloud/firestore   # Firestore の場合 (Postgres は kysely pg)
npm install -D vitest                                    # 契約テストを使う場合
```

## 4 つの入口

| 入口 | 中身 | 要る SDK |
|---|---|---|
| `@igeta/persistence` | Result・AppError・Repository・Mapper・TransactionRunner・DocumentId・ListQuery | なし |
| `@igeta/persistence/firestore` | FirestoreRepository・FirestoreTransactionRunner・createFirestore | @google-cloud/firestore |
| `@igeta/persistence/postgres` | SqlRepository・SqlTransactionRunner・createPostgres・migrateToLatest | kysely・pg |
| `@igeta/persistence/testing` | describeRepositoryContract・InMemoryRepository・InMemoryTransactionRunner・emulator と Postgres の helper | vitest |

## 使い方 (集約 1 つ: memo)

```ts
import { ok, err, unprocessable, type Mapper } from '@igeta/persistence';
import { FirestoreRepository, FirestoreTransactionRunner, createFirestore } from '@igeta/persistence/firestore';

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

const db = createFirestore('my-project');
const memos = new FirestoreRepository({
  db,
  collection: 'memos',
  mapper: memoMapper,
  filterFields: (filter: { state?: Memo['state'] }) => ({ state: filter.state }), // 絞り込みの値を保存の項目へ写す。undefined は絞らない
});
const runner = new FirestoreTransactionRunner(db);

await runner.run((scope) => memos.save({ id: 'm-1', title: 'はじめ', state: 'draft' }, scope));
const page = await memos.list({ filter: { state: 'draft' }, limit: 20 }); // page.truncated: 続きがあれば true
```

Postgres の使い方は [docs/postgres.md](docs/postgres.md)。

## 契約テスト

```ts
import { describeRepositoryContract } from '@igeta/persistence/testing';

describeRepositoryContract({
  name: 'memos (Firestore)',
  setup: () => ({ repository: memos, runner, newId: () => crypto.randomUUID(), malformed: [...] }),
  fixtures: {
    make: (id, state) => ({ id, title: state === 'first' ? '最初' : '次', state: state === 'first' ? 'draft' : 'published' }),
    filterOf: (state) => ({ state: state === 'first' ? 'draft' : 'published' }),
    equals: (a, b) => a.title === b.title && a.state === b.state,
  },
});
```

- 自分の repository が C1〜C9 を通すかを確かめる。id は `[A-Za-z0-9_-]` の 1〜64 字
- `malformed` は壊れた保存データを生で置く関数の一覧 (C9 の 3 ケース)。省くと C9 は表から外れ、題名に「表から外した」と出る。CI では `REQUIRE_EMULATOR=1`・`REQUIRE_POSTGRES=1` を付ける

## 開発と版

```sh
npm test                 # unit
npm run test:firestore   # Firestore emulator が要る
```

semver。1.0.0 までは破壊的変更を minor で入れ、CHANGELOG.md に書く。
