# @igeta/persistence — Postgres

Postgres の入口 (`@igeta/persistence/postgres`) は Kysely と pg を使う。Mapper と filterFields は README の例と同じ。

```sh
npm install @igeta/persistence kysely pg
```

## table の型と接続

- table の型は `Database` interface として自分で書き、`createPostgres<Database>(url)` に渡す。`SqlRepository` の `table` は `keyof Database` だけを受け、Mapper の record 型は table の列 (id を除く) と合わせる。他の table の Mapper や存在しない table 名は、型で落ちる
- table の列名は、Mapper が返す record の項目名と同じにする。DB の CHECK 制約は利用者が決める
- 接続先は環境変数 (`PG_URL` など) から渡す。コードに埋めない

## migration

`migrateToLatest(database, migrations)` は Kysely の `Migrator` を包む。`migrations` は名前 → `{ up, down? }` で、名前の昇順に流れる。同じ名前は 2 回目に何もしない。失敗したら、その Error を投げる。

## 読み書きの決まり

- 一覧は `ORDER BY id COLLATE "C"` で並ぶ (JS の `sort()` と同じ順)
- id の規則は Firestore と同じ (`[A-Za-z0-9_-]` の 1〜64 字、`__x__` の形は不可)
- `SqlTransactionRunner` は `serializable` で実行する。競合で起きた SQL のエラー (SQLSTATE 40001) は再試行せず、そのまま上げる。再試行するかは呼び出し側が決める
- 接続できない失敗 (SQLSTATE のクラス 08、接続先に届かない `ECONNREFUSED` など) は `unavailable` の AppError になる。それ以外の SQL のエラーは素通しにする

## 開発

```sh
docker run -d --name pg-test -e POSTGRES_PASSWORD="$PGPASSWORD" -p 5433:5432 postgres:16
PG_URL="postgres://postgres:$PGPASSWORD@127.0.0.1:5433/postgres" npm run test:postgres
```

パスワードはテスト専用の値を環境変数で渡す。CI の `postgres` job は services で `postgres:16` を立てて同じ環境変数を渡す。
