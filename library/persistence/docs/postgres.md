# @igeta/persistence — Postgres の使い方

Postgres は Kysely + pg の入口 (`@igeta/persistence/postgres`) で使う。Mapper と filterFields は Firestore の例 (README) と同じものを使い、入口と基底の名前だけが替わる。

```sh
npm install @igeta/persistence kysely pg
```

## 接続と migration

```ts
import { createPostgres, migrateToLatest, SqlRepository, SqlTransactionRunner } from '@igeta/persistence/postgres';

const pg = createPostgres(process.env.PG_URL ?? ''); // 接続先は環境変数から
await migrateToLatest(pg, {
  '0001-memos': { up: (db) => db.schema.createTable('memos').addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('title', 'text').addColumn('state', 'text').execute() },
});
```

- `migrateToLatest` は Kysely の `Migrator` を包む。同じ名前の migration は 2 回目に何もしない
- table の列名は保存の項目名と同じにする。DB の CHECK 制約は利用者が決める (契約テストの table には置かない)

## 読み書き

```ts
const pgMemos = new SqlRepository({
  db: pg,
  table: 'memos',
  mapper: memoMapper,
  filterFields: (filter: { state?: Memo['state'] }) => ({ state: filter.state }),
});
const pgRunner = new SqlTransactionRunner(pg);

await pgRunner.run((scope) => pgMemos.save({ id: 'm-1', title: 'はじめ', state: 'draft' }, scope));
const page = await pgMemos.list({ filter: { state: 'draft' }, limit: 20 });
```

- 一覧は `ORDER BY id COLLATE "C"` で並ぶ (JS の `sort()` と同じ順)
- id の規則は Firestore と同じ (`[A-Za-z0-9_-]` の 1〜64 字)
- Tx の中の失敗は全部巻き戻る。競合で起きた SQL のエラーは再試行せず、そのまま上げる

## 契約テストと開発

契約テストは `describeRepositoryContract` に `pgMemos` と `pgRunner` を渡す (README の例と同じ形)。

```sh
docker run -d -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:16
PG_URL=postgres://postgres:test@localhost:5432/postgres REQUIRE_POSTGRES=1 npm run test:postgres
```

`REQUIRE_POSTGRES=1` を付けると、`PG_URL` が無いときに skip せず落ちる。CI の `postgres` job は services で `postgres:16` を立てて同じ環境変数を渡す。
