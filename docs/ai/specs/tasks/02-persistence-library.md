---
id: tasks-persistence-library
title: 実装タスク — DB 層ライブラリ (@igeta/persistence)
type: design
kind: tasks
id_prefix: T
id_pattern: bare-numeric
status: draft
canonical: true
owners: [eng]
created: 2026-10-20
depends_on: [adr-0012-persistence-library]
relates_to: [test-persistence-library]
---

# 実装タスク — DB 層ライブラリ (@igeta/persistence)

> **TL;DR**: `library/persistence` を 0.1.0 にするまでの分解と、雛形の後の形。受入は テスト仕様 09 の表の行が全部通ること。雛形の書き換え (後続 PR) は含まない
> - 1 タスク = 1 commit。チェックは実装とテストが両方通ってから。`[P]` は別のファイルだけを触る

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [ADR-0012](../../../person/decisions/2026/0012-persistence-library.md) | ADR-0012 |
| 下流 | [テスト仕様 09](../shared/tests/09-persistence-library.md) / 雛形の後続 PR | TST-* |

## 1. 木 (`library/persistence/`)

| 場所 | ファイル | 役割 |
|---|---|---|
| `./` | package.json・package-lock.json | 名前・4 入口・peer・scripts / 版の固定 (commit する) |
| | tsconfig.json・tsup.config.ts・vitest.config.ts | 型検査専用 (noEmit) / 4 入口を esm・cjs・d.ts へ / 全 spec を走らせる |
| | firebase.json・README.md・CHANGELOG.md・LICENSE | emulator の port / 利用者向け (使い方の例つき) / 0.1.0 / MIT |
| `src/` | index.ts | core の入口 (再エクスポートだけ。公開 API) |
| `src/core/result/` | result.ts・app-error.ts | ok・err・Result / AppError と 6 種の生成関数 |
| `src/core/identity/` | document-id.ts・id-generator.ts | id の形 (1〜64 字、`__x__` は不可。Firestore と Postgres で同じ規則) / IdGenerator と UUID 実装 |
| `src/core/query/` | list-page.ts・field-filter.ts | ListQuery・ListPage・takePage (limit + 1 で打ち切り、limit の検査) / 等価 filter の型と照合 |
| `src/core/repository/` | repository.ts・mapper.ts・stored-values.ts | Repository (port) / Mapper と readStored (err を unprocessable に、id を付ける) / undefined を null で保存する |
| `src/core/transaction/` | transaction.ts・scope-handle.ts・work-failure.ts | TransactionScope (不透明)・TransactionRunner / scope と Tx の対応 (WeakMap。キャスト無し) / work の失敗を翻訳しない |
| `src/firestore/` | index.ts | 入口 |
| `src/firestore/client/` | client.ts・errors.ts | createFirestore・firestoreSettings (emulator では preferRest を外す) / code 14 を unavailable へ。他は素通し |
| `src/firestore/repository/` | repository.ts・stored-record.ts | FirestoreRepository (collection・Mapper・filterFields を受ける基底) / 文書と record の境界 |
| `src/firestore/transaction/` | transaction-runner.ts・transaction-scope.ts | FirestoreTransactionRunner / db ごとの scope の表 |
| `src/postgres/` | index.ts・migrations.ts | 入口 / migrateToLatest (Kysely の `Migrator` を包む。`kysely/migration`) |
| `src/postgres/client/` | client.ts・errors.ts | createPostgres (Kysely + pg Pool、onConnectionError) / 接続断を unavailable へ。SQL のエラーは素通し |
| `src/postgres/repository/` | repository.ts・generic-database.ts | SqlRepository (`ORDER BY id COLLATE "C"`) / 型付きの Kysely と内部の汎用 Kysely の境界 |
| `src/postgres/transaction/` | transaction-runner.ts・transaction-scope.ts | SqlTransactionRunner (serializable) / db ごとの scope の表 |
| `src/testing/` | index.ts | 入口 (契約テストと InMemory) |
| `src/testing/contract/` | describe-repository-contract.ts・types.ts・failure.ts・same-content.ts | describeRepositoryContract (C1〜C12) / 型 / 失敗の要約 / 内容の比較 |
| `src/testing/contract/rows/` | basic.ts・id.ts・list.ts・malformed.ts・optional.ts・transaction.ts | C1〜3 / C10 / C4〜6 / C9 / C11・12 / C7〜8 |
| `src/testing/in-memory/` | store.ts・repository.ts・transaction-runner.ts | InMemoryStore (record を持つ。`putRaw` でテスト用に壊れた record を置く)・InMemoryRepository (Mapper と filterFields を受ける)・InMemoryTransactionRunner |
| `src/testing/fixtures/` | memo.ts・in-memory-memo-parts.ts・firestore-memo-parts.ts・postgres-memo-parts.ts | 契約に渡す memo の fixture と、各実装の部品 (テスト用 table には CHECK 制約を置かない。C9 で壊れた行を置くため) |
| `src/testing/harness/` | emulator.ts・postgres.ts・integration-suite.ts・capture-thrown.ts | describeEmulator / describePostgres / 走らせる・飛ばす・落とすの判定 / 投げられた値の取得 |
| `test/` | readability.spec.ts・build.spec.ts・consumer/ | test-persistence-library/TST-604〜609 / test-persistence-library/TST-601〜603 の fixture (bundler・nodenext) |
| `src/**` | *.spec.ts | 各 .ts の隣 (フォルダ構成の規則は MD-11: 本体 7 つまで・接頭辞 3 つ以上でフォルダ・utils を作らない。`igeta-check-layout` が `npm run lint` で検査する。別フォルダは `package.json` の `imports` (`#core/…`) で読む)。表の行 (test-persistence-library/TST-101〜120・402〜406・504〜506) |

## 2. package.json

- exports: `.`・`./firestore`・`./postgres`・`./testing`。各々 `types`・`import`・`require` (import は `.d.ts`、require は `.d.cts`)。`sideEffects: false`。peerDependencies は `@google-cloud/firestore` (^7。雛形と揃える)・`kysely`・`pg`・`vitest` で、すべて optional
- scripts: `build` (tsup)・`typecheck` (tsc --noEmit)・`test` (vitest run)・`test:firestore` (firebase emulators:exec --project demo-persistence と `REQUIRE_EMULATOR=1`)・`test:postgres` (`REQUIRE_POSTGRES=1`)。kysely と pg の版は実装時に確かめて lock に残す

## 3. Igeta 本体の検査

| 場所 | 変更 |
|---|---|
| `package.json` | `test` を `test:scripts && test:library` に (`test:library` は `npm --prefix library/persistence test`)。root の tsc は src だけを見る |
| `.github/workflows/ci.yml` | 新 job `library-unit` (paths 無し・必須): npm ci → typecheck → test → build |
| `.github/workflows/library.yml` (新) | paths は `library/**`。job `firestore` (Java 21・`REQUIRE_EMULATOR=1`)、job `postgres` (services `postgres:16`・`PG_URL`・`REQUIRE_POSTGRES=1`)。templates.yml と同じく必須にしない (paths 外の PR を止めないため) |
| `.markdownlint-cli2.yaml`・`.igeta.json`・`.github/CODEOWNERS` | globs に `library/**/*.md` / humanPaths に `library/**` / `/library/ @SakakitaniJunya` |

## 4. 雛形の後の形 (後続 PR。この PR では書かない)

| 今の写し (hono・nestjs) | 後の形 |
|---|---|
| `shared/domain/result.ts`・`app-error.ts`・`transaction-*.ts`・`doc-id.ts` | `@igeta/persistence` から import。`assertDocumentId` は `invalid` を投げ、`InvalidDocIdSegment` は消える |
| `shared/infrastructure/firestore.ts` (+ spec)・`modules/__context__/infrastructure/firestore-*.ts` | createFirestore・FirestoreRepository・FirestoreTransactionRunner の import。雛形に残るのは Mapper 1 つ。firestore-scope は消える |
| `domain/ports/__aggregate__.repository.port.ts` | `Repository<Entity, Id, Filter>` を使う 1 行の型 (domain に SDK は出ない) |
| `shared/test-support/emulator.ts`・契約テストの写し | `@igeta/persistence/testing` の helper と describeRepositoryContract の呼び出し 1 つ |
| `application/list-__aggregates__.usecase.ts` | `limit + 1` を外す。repository が `isTruncated` を返す |

nestjs は `modules/`・`shared/` が hono と同一ファイルなので、同じ対応をとる。差は `entries/database/database.module.ts` だけで、`FIRESTORE` トークンの provider が `createFirestore` を出している部分を、FirestoreRepository の組み立てに替える。`shared/presentation/*` は HTTP 層なので library に入れず、雛形に残す。Rust 版 (`library/persistence-rs/`、後続) の見当は Result → `Result<T, AppError>`、Repository → trait。

公開前の検査 (後続 PR で `check-templates` に `--with-library <path>` を足す): `library/persistence` を `npm run build && npm pack` して tgz を作り、一時 dir の package.json の `@igeta/persistence` を `file:<tgz>` に差し替えて `npm install` する (lockfile は使わない)。公開後は差し替え無しで `npm ci`。

## Phase 1 Setup

- [x] T001 [ADR-0012] 骨格: package.json・tsconfig・tsup・vitest・LICENSE・CHANGELOG と、core の `Result`・`AppError` を入れた 4 入口 (sub-entry は型の再エクスポートだけ)。`build`・`typecheck` が通る

## Phase 2 Foundational

- [x] T002 [P] [test-persistence-library/TST-101〜112・116〜120] core の値: result・app-error・document-id・list-page・field-filter・scope-handle・id-generator と各 spec
- [x] T003 [test-persistence-library/TST-113〜115] core の mapper: readStored。repository.ts・transaction.ts の型
- [x] T004 [P] spike: Kysely で table を型引数に受ける基底の型が通るかを型検査だけで確かめた。試作は残さない。**T007 の前に終える**。
  - 結論 (U-1): 本体が `Kysely<DB>` を直接叩く素直な基底 (`SqlRepository<DB, TB extends keyof DB & string, Entity>`) は通らない (`where`・`orderBy` が TS2349、`Insertable<DB[TB]>` が TS2322)。Row を型引数にする案も、`Kysely<Database>` が `Kysely<Record<string, Row>>` に入らず不可 (Kysely は DB の型について不変)。`withTables` で cast を避ける案も不可。
  - 通る形 (V4): 公開の型は `SqlRepository<DB, TB extends keyof DB & string, Entity>` で、`db: Kysely<DB>`・`table: TB`・`mapper: Mapper<Entity, Omit<Selectable<DB[TB]>, 'id'>>`。内部は行を `{ id: string }` とする `Kysely<Record<string, { id: string }>>` で持つ。境界の cast は `db as unknown as Kysely<GenericDb>` の 1 か所で、理由付きの eslint-disable (TS-02 の例外)。他の table の Mapper や存在しない table 名は型で落ちる。読み出した行を Mapper の入力へ渡す cast は、`fromRecord` が実行時に検証する前提で 1 関数に集める。
  - 利用側: `createPostgres<Database>()` は利用者が Database 型を渡す generic にする (`Kysely<unknown>` では table 名が `never` になる)。Transaction を直接渡すと型引数の推論が崩れるが、`SqlTransactionRunner` が scope で受けるので利用者は直接渡さない。ADR-0012 の再検討トリガは発動しない。
- [x] T005 [test-persistence-library/TST-201〜213・301〜307] testing: 契約 (contract-*) と InMemory 3 ファイル。InMemory は Mapper と filterFields を受け、`putRaw` で壊れた record を置いて C1〜C12 の 12 行を通す

## Phase 3+ User Story

- [x] T006 [test-persistence-library/TST-401〜406・408・708] firestore 入口と emulator helper。client.ts は shared/infrastructure/firestore.ts の挙動 (emulator で preferRest を外す) をそのまま持つ。Firestore で契約を通す。契約用の collection / table は実装ごとに名前を分け、契約は `newId` で作った id を `remove` で全部消す (`setup` は `beforeAll` で 1 回だけ呼ばれる)
- [x] T007 [test-persistence-library/TST-501〜502・504〜508・701〜707・709] postgres 入口・harness・migrate。Postgres 16 で契約を通す (T004 の後)。契約用の collection / table は実装ごとに名前を分け、契約は `newId` で作った id を `remove` で全部消す (`setup` は `beforeAll` で 1 回だけ呼ばれる)
- [ ] T008 [test-persistence-library/TST-601〜609] build・consumer fixture・読みやすさの検査・npm pack の確認。tsup の d.ts は共有型を最初の入口 (`firestore/index.d.ts`) に寄せ、cjs は入口ごとに class を持つため、入口をまたぐ型と class (`AppError` の `instanceof`) の同一性を確かめる

## Polish

- [ ] T009 Igeta 本体の検査 (3 の表) を入れ、新しい文書と ADR-0012 を生成索引へ。docs:check と docs:template-check を通す

## 依存と並列

前提: T001 → T002・T003 → T005 → T006・T007 (T007 は T004 の後) → T008 → T009。T006 と T007 は別ファイルを触る。
