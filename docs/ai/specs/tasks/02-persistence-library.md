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
| | firebase.json・README.md・CHANGELOG.md・LICENSE | emulator の port / 利用者向け (80 行) / 0.1.0 / MIT |
| `src/` | index.ts | core の入口 (再エクスポートだけ) |
| `src/core/` | result.ts・app-error.ts | ok・err・Result / AppError と 6 種の生成関数 |
| | repository.ts・list-page.ts | Repository (port)・ListQuery・ListPage / limit + 1 で打ち切り、limit の検査 |
| | transaction.ts・scope-handle.ts | TransactionScope (不透明)・TransactionRunner / scope と Tx の対応 (WeakMap。キャストを 1 か所に) |
| | mapper.ts・document-id.ts | Mapper と readStored (err を unprocessable に、id を付ける) / id の形 (1〜64 字) |
| | id-generator.ts・field-filter.ts | IdGenerator と UUID 実装 / 等価 filter の型と照合 |
| `src/firestore/` | index.ts・client.ts | 入口 / createFirestore・firestoreSettings (emulator では preferRest を外す) |
| | transaction-runner.ts・repository.ts | FirestoreTransactionRunner / FirestoreRepository (collection・Mapper・filterFields を受ける基底) |
| | errors.ts | code 14 を unavailable へ。他は素通し |
| `src/postgres/` | index.ts・client.ts | 入口 / createPostgres (Kysely + pg Pool) |
| | transaction-runner.ts・repository.ts | SqlTransactionRunner / SqlRepository (`ORDER BY id COLLATE "C"`) |
| | errors.ts・migrations.ts | SQLSTATE class 08 を unavailable へ / migrateToLatest (Kysely の Migrator を包む) |
| `src/testing/` | index.ts・emulator.ts・postgres-harness.ts | 入口 / describeEmulator・uniqueId / describePostgres・テスト用 table |
| | contract/ (5 files) | describeRepositoryContract・types・rows-basic (C1〜3)・rows-list (C4〜6)・rows-transaction (C7〜8)・rows-malformed (C9) |
| | in-memory/ (3 files) | InMemoryStore・InMemoryRepository・InMemoryTransactionRunner |
| `test/` | readability.spec.ts・build.spec.ts・consumer/ | TST-604〜609 / TST-601〜603 の fixture (bundler・nodenext) |
| `src/**` | *.spec.ts | 各 .ts の隣。表の行 (TST-101〜115・402〜407・504〜506) |

## 2. package.json

- exports: `.`・`./firestore`・`./postgres`・`./testing`。各々 `types`・`import`・`require` (import は `.d.ts`、require は `.d.cts`)。`sideEffects: false`。peerDependencies は `@google-cloud/firestore` (^7。雛形と揃える)・`kysely`・`pg`・`vitest` で、すべて optional
- scripts: `build` (tsup)・`typecheck` (tsc --noEmit)・`test` (vitest run)・`test:firestore` (firebase emulators:exec --project demo-persistence と `REQUIRE_EMULATOR=1`)・`test:postgres` (`REQUIRE_POSTGRES=1`)。kysely と pg の版は実装時に確かめて lock に残す

## 3. Igeta 本体の検査

| 場所 | 変更 |
|---|---|
| `package.json` | `test` を `test:scripts && test:library` に (`test:library` は `npm --prefix library/persistence test`)。root の tsc は src だけを見る |
| `.github/workflows/ci.yml` | 新 job `library-unit` (paths 無し): npm ci → typecheck → test → build |
| `.github/workflows/library.yml` (新) | paths は `library/**`。job `firestore` (Java 21・`REQUIRE_EMULATOR=1`)、job `postgres` (services `postgres:16`・`PG_URL`・`REQUIRE_POSTGRES=1`) |
| `.markdownlint-cli2.yaml`・`.igeta.json`・`.github/CODEOWNERS` | globs に `library/**/*.md` / humanPaths に `library/**` / `/library/ @SakakitaniJunya` |

## 4. 雛形の後の形 (後続 PR。この PR では書かない)

| 今の写し (hono) | 後の形 |
|---|---|
| `shared/domain/result.ts`・`app-error.ts`・`transaction-*.ts`・`doc-id.ts` | `@igeta/persistence` から import。`assertDocumentId` は `invalid` を投げ、`InvalidDocIdSegment` は消える |
| `shared/infrastructure/firestore.ts` (+ spec)・`modules/__context__/infrastructure/firestore-*.ts` | createFirestore・FirestoreRepository・FirestoreTransactionRunner の import。雛形に残るのは Mapper 1 つ。firestore-scope は消える |
| `domain/ports/__aggregate__.repository.port.ts` | `Repository<Entity, Id, Filter>` を使う 1 行の型 (domain に SDK は出ない) |
| `shared/test-support/emulator.ts`・契約テストの写し | `@igeta/persistence/testing` の helper と describeRepositoryContract の呼び出し 1 つ |
| `application/list-__aggregates__.usecase.ts` | `limit + 1` を外す。repository が `truncated` を返す |

`shared/presentation/*` は HTTP 層なので library に入れず、雛形に残す。Rust 版 (`library/persistence-rs/`、後続) の見当は Result → `Result<T, AppError>`、Repository → trait。

## Phase 1 Setup

- [ ] T001 [ADR-0012] 骨格: package.json・tsconfig・tsup・vitest・LICENSE・CHANGELOG と空の入口。`build`・`typecheck` が通る

## Phase 2 Foundational

- [ ] T002 [P] [TST-101〜112] core の値: result・app-error・document-id・list-page・field-filter・scope-handle・id-generator と各 spec
- [ ] T003 [TST-113〜115] core の mapper: readStored。repository.ts・transaction.ts の型
- [ ] T004 [P] [U-1] spike: Kysely で table を型引数に受ける基底の型が通るかを型検査だけで確かめる。結果を U-1 に書き、試作は残さない
- [ ] T005 [TST-201〜209・301] testing: contract 5 ファイルと InMemory 3 ファイル。InMemory で C1〜C8 を通す

## Phase 3+ User Story

- [ ] T006 [TST-401〜407] firestore 入口と emulator helper。client.ts は shared/infrastructure/firestore.ts の挙動 (emulator で preferRest を外す) をそのまま持つ。Firestore で契約を通す
- [ ] T007 [TST-501〜506・701〜706] postgres 入口・harness・migrate。Postgres 16 で契約を通す
- [ ] T008 [TST-601〜609] build・consumer fixture・読みやすさの検査・npm pack の確認

## Polish

- [ ] T009 Igeta 本体の検査 (3 の表) を入れ、新しい文書と ADR-0012 を生成索引へ。docs:check と docs:template-check を通す

## 依存と並列

1 タスク = 1 commit。前提: T001 → T002・T003 → T005 → T006・T007 (別ファイル) → T008 → T009。T004 は別のファイルだけを触る。

## 6. 確かめる点と判断待ち

- U-1 Kysely の汎用基底 (T004)。通らなければ Postgres 入口の table の渡し方を変え、ADR-0012 を改める
- U-2 Prisma の比較を公式 docs で再確認する (schema の経路が変わった可能性)。Drizzle は比較していない
- U-3 npm の公開時期と、未公開の間に雛形の後続 PR がどう依存を入れるか (`file:` はパスが合わない)。CEO 判断
- U-4 library.yml の firestore・postgres job を必須にするか。必須にすると paths 外の PR が待つ
- U-5 DocumentId を core に置き、Postgres にも同じ 1〜64 字を掛ける。反対なら firestore へ移す
- U-6 InMemory は entity を直接持つ (Mapper を通らない)。C9 は InMemory で表から外れる。契約用の table に DB の CHECK は置かない (C9 で壊れた行を置くため)
