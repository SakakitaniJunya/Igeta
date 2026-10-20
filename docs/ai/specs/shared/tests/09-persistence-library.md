---
id: test-persistence-library
title: テスト仕様 — DB 層ライブラリ (@igeta/persistence)
type: design
kind: test-spec
arc42: 10
id_prefix: TST
status: draft
canonical: true
owners: [eng]
created: 2026-10-20
depends_on: [adr-0012-persistence-library]
relates_to: []
---

# テスト仕様 — DB 層ライブラリ (@igeta/persistence)

> **TL;DR**: `library/persistence` の全部の行 (core・mapper・契約 C1〜C10・InMemory・Firestore・Postgres・build と読みやすさ) を、1 行 = 1 テストで書く。受入条件は、契約 C1〜C10 が InMemory・Firestore emulator・Postgres 16 の全部で通ること
> - 題名は vitest の `it` の題名と同じにする。判定は期待結果の列の通りに機械で行う
> - 契約の行 (TST-201〜209) は 3 つの実装で同じ本文を通す。本文を実装ごとに書き換えない

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [ADR-0012](../../../../person/decisions/2026/0012-persistence-library.md) 決定 1〜4 | ADR-0012 |
| 下流 | `library/persistence/src/**/*.spec.ts`・`library/persistence/test/*.spec.ts` / [実装タスク 02](../../tasks/02-persistence-library.md) | TST-* / T* |

## 0. 規則

| # | 規則 |
|---|---|
| R1 | 1 行 = 1 テスト。判定を 2 つ入れない |
| R2 | 実行環境が無いときの skip は手元だけ許す。CI は `REQUIRE_EMULATOR=1`・`REQUIRE_POSTGRES=1` で落とす (サイレント縮退禁止) |
| R3 | 契約の fixture (`createEntity`・`filterByState`・`isSameContent`) は実装者が渡す。本文 (C1〜C10) は 3 つの実装で同じ。`setup` は契約の最初 (`beforeAll`) に 1 回だけ呼び、失敗したら skip でなく落とす。終わりに `teardown` (`close`) を呼ぶ。各 it は `newId` の id だけを使う |
| R5 | 契約は `newId` で作った id を全部覚え、最後に `remove` で消す。共有の DB に行を溜めない |
| R4 | 期待結果は kind・件数・値・終了状態で書く。「正しく動く」は書かない |

## 1. テストケース一覧

| ID | 層 | 対象 | 前提 (Given) | 操作 (When) | 期待結果 (Then) | 対応 |
|---|---|---|---|---|---|---|
| TST-101 | 単体 | AppError | `invalid('m', ['name'])` を作る | kind・message・detail を読む | kind `invalid`・message `m`・detail `['name']`。detail を省くと undefined | 決定 1 |
| TST-102 | 単体 | AppError | 6 種の生成関数 (invalid・unauthorized・not_found・conflict・unprocessable・unavailable) | 各々を作る | kind が関数名と一致し、`AppError` の instance | 決定 1 |
| TST-103 | 単体 | Result | `ok(1)`・`err(e)` | 各々を作る | `{ ok: true, value: 1 }`・`{ ok: false, error: e }` | 決定 1 |
| TST-104 | 単体 | document-id | `a-1_B`・1 文字・64 文字 | `isDocumentId` に通す | true | 決定 1 |
| TST-105 | 単体 | document-id | `.`・`..`・`a/b`・空文字・65 文字・`名前` | `isDocumentId` に通す | すべて false | 決定 1 |
| TST-106 | 単体 | document-id | `a/b` | `assertDocumentId` を呼ぶ | `invalid` を投げる。message に値を出さない | 決定 1 |
| TST-107 | 単体 | list-page | 3 件の行・limit 2 | `takePage` | items 2 件・isTruncated true | 決定 1 |
| TST-108 | 単体 | list-page | 3 件の行・limit 3 | `takePage` | items 3 件・isTruncated false | 決定 1 |
| TST-109 | 単体 | list-page | limit が 0・-1・1.5・NaN | `takePage` | すべて `invalid` | 決定 1 |
| TST-110 | 単体 | field-filter | 等価 filter `{ state: 'draft' }` と record | 照合する | 一致で true。1 項目でも違えば false。空 filter は true | 決定 1 |
| TST-111 | 単体 | scope-handle | `createScope(h)` で作った scope | `handleOf` で取り出す | 同じ `h` が返る | 決定 1 |
| TST-112 | 単体 | scope-handle | どの runner も作っていない scope | `handleOf` で取り出す | 普通の Error を投げる (AppError ではない) | 決定 1 |
| TST-113 | 単体 | mapper | 有効な memo の record | `fromRecord` して `toRecord` に戻す | 元と同じ内容 (ok) | 決定 1 |
| TST-114 | 単体 | readStored | mapper の `fromRecord` が err を返す | `readStored(mapper, 'id1', record)` | `unprocessable` で detail が `{ id: 'id1' }` | 決定 1 |
| TST-115 | 単体 | readStored | mapper の `fromRecord` が例外を投げる | 同じ呼び出し | 例外を包まず、そのまま投げる (黙って 422 にしない) | 決定 1 |
| TST-116 | 単体 | id-generator | `createUuidGenerator()` で作った generator | `next()` を 2 回呼ぶ | 生成した id は DocumentId の規則を満たし、2 回で異なる | 決定 1 |
| TST-117 | 単体 | document-id | `__x__`・`____` | `isDocumentId` に通す | どちらも false (Firestore が予約する形。Postgres にも同じ規則を掛ける)。`__x`・`x__`・`a__b` は true | 決定 1 |
| TST-118 | 単体 | scope-handle | `createScope(h)` で作り、`endScope` した scope | `handleOf` で取り出す | 普通の Error を投げる (終わった Transaction の scope は使えない) | 決定 1 |
| TST-119 | 単体 | work-failure | runner の work が ECONNRESET 付きの Error を投げる。別に、DB 側の失敗を起こす | `translateDatabaseFailure` を通す | work の失敗は翻訳せずそのまま届く。DB 側の失敗は translate を通る | 決定 1 |
| TST-201 | 契約 C1 | Repository | 保存していない id | `findById` | undefined | 決定 2 |
| TST-202 | 契約 C2 | Repository | draft の状態の entity を保存 | 同じ id で読む | `isSameContent` が true | 決定 2 |
| TST-203 | 契約 C3 | Repository | draft を保存し、同じ id に published を保存 | 読む | published の内容 | 決定 2 |
| TST-204 | 契約 C4 | Repository | ASCII の id を 3 件保存 | `list` (limit 1000) | id の並びが昇順で、3 件が含まれる | 決定 2 |
| TST-205 | 契約 C5 | Repository | draft を 2 件、published を 1 件保存 | published の filter で `list` | 返る行はすべて published。published の 1 件を含み、draft は含まない | 決定 2 |
| TST-206 | 契約 C6 | Repository | limit + 1 件 (limit は 3) を保存 | `list` (limit 3) | items 3 件・isTruncated true | 決定 2 |
| TST-207 | 契約 C7 | TransactionRunner | Tx の中で保存してから throw する | `run` を呼ぶ | reject (boom)。後で読むと undefined | 決定 2 |
| TST-208 | 契約 C8 | TransactionRunner | draft を保存済み | Tx の中で読み、published を保存する | Tx の中で読めた。Tx の外で読むと published | 決定 2 |
| TST-209 | 契約 C9 | Repository | 不変条件を外した保存データ 3 種 (名前が長すぎる・名前が文字列でない・状態が不正)。置いた行は it の後で必ず `remove` する | `findById` と `list` を呼ぶ | 両方とも `unprocessable` で detail が `{ id }` | 決定 2 |
| TST-210 | 単体 | describeRepositoryContract | 壊れたデータの種類 (`malformedKinds`) があるのに、`setup` が置く関数 (`plantMalformed`) を返さない | 検査する | Error を投げる (`beforeAll` で落ちる)。種類が空なら投げない | 決定 2 |
| TST-211 | 契約 C10 | Repository | 形の悪い id `../x` と、id が `a/b` の entity | `findById('../x')` と `save` | findById は undefined を返す (読みに行かない)。save は `invalid` を投げる | 決定 1 |
| TST-301 | 単体 | InMemory | Mapper と filterFields を渡した InMemoryRepository。壊れた record は `putRaw` で生で置く | 契約 C1〜C10 を実行 | 10 行が通る (C9 は 3 ケースとも)。`putRaw` は Firestore・Postgres の harness と同じ形で壊れた record を置く | 決定 2 |
| TST-302 | 単体 | InMemory | 別々の id を書く Transaction を、開始が重なるように 2 つ実行し、どちらも commit | 外から 2 つの id を読む | 両方読める (後に commit した側が先の書き込みを消さない) | 決定 2 |
| TST-303 | 単体 | InMemory | Transaction の実行中に、Transaction の外で別の id を保存する | Transaction が commit した後に読む | 外で保存した行が残っている | 決定 2 |
| TST-304 | 単体 | InMemory | commit 済みの Transaction の scope | その scope で `save` する | 普通の Error を投げる (黙って捨てない) | 決定 2 |
| TST-305 | 単体 | InMemory | 契約 C1〜C10 を通し終えた保存先 | 行を数える | 0 件 (契約が `newId` で作った id を全部消している) | 決定 2 |
| TST-306 | 単体 | InMemory | rollback 済み (work が throw した) Transaction の scope | その scope で `save` する | 普通の Error を投げる (黙って捨てない)。scope が取れていなければ、その旨の message で失敗する | 決定 2 |
| TST-307 | 結合 | README | README の「使い方」と「契約テスト」のコードと同じ手順 (InMemory の memo) | `src/readme-example.spec.ts` で流す | draft の memo を保存して `list` すると 1 件・isTruncated false。同じ設定で契約 C1〜C10 が通る | 決定 1 |
| TST-401 | 結合 | FirestoreRepository | emulator あり・`REQUIRE_EMULATOR=1` | 契約 C1〜C10 を実行 | 10 行が通る (C9 は 3 ケースとも) | 決定 2 |
| TST-402 | 単体 | firestore/errors | code 14 (UNAVAILABLE) の Error | 変換する | `unavailable` の AppError | 決定 1 |
| TST-403 | 単体 | firestore/errors | code 14 以外の Error | 変換する | 同じ Error が返る (AppError にしない) | 決定 1 |
| TST-404 | 単体 | firestore/client | `FIRESTORE_EMULATOR_HOST` がある | `firestoreSettings()` | preferRest が false | 決定 1 |
| TST-405 | 単体 | firestore/client | 環境変数が無い | `firestoreSettings()` | preferRest が true | 決定 1 |
| TST-406 | 単体 | firestore/client | 引数・GCP_PROJECT・GCLOUD_PROJECT を全部入れる | `firestoreSettings()` | projectId は引数の値 | 決定 1 |
| TST-408 | 結合 | README | README の「Firestore の使い方」と同じ手順 (emulator) | `src/firestore/readme-example.emulator.spec.ts` で流す | draft の memo を保存して `list` すると 1 件・isTruncated false | 決定 1 |
| TST-501 | 結合 | SqlRepository | Postgres 16・`REQUIRE_POSTGRES=1` | 契約 C1〜C10 を実行 | 10 行が通る (C9 は 3 ケースとも) | 決定 2 |
| TST-502 | 結合 | SqlRepository | id が `a-B`・`a1`・`a_0`・`A0` の 4 件 | `list` (limit 1000) | 並びが JS の `sort()` と同じ (`COLLATE "C"`) | 決定 2 |
| TST-504 | 単体 | postgres/errors | 接続の失敗の印を持つ Error (SQLSTATE `08006` `57P01` `57P03` などと、Node の `ECONNREFUSED` `ECONNRESET` `EHOSTUNREACH` `ENOTFOUND` `EAI_AGAIN` `EPIPE` `ETIMEDOUT`、code を持たない `Connection terminated unexpectedly`) | 変換する | `unavailable` の AppError | 決定 1 |
| TST-505 | 単体 | postgres/errors | SQLSTATE `23505` の Error | 変換する | 同じ Error が返る | 決定 1 |
| TST-506 | 結合 | migrateToLatest | 同じ migration の集まり | 2 回続けて実行する | 2 回目は何もせず成功する | 決定 1 |
| TST-507 | 結合 | README | README の「Postgres の使い方」と同じ手順 (migration → 保存 → list) | `src/postgres/readme-example.postgres.spec.ts` で流す | draft の memo を保存して `list` すると 1 件・isTruncated false | 決定 1 |
| TST-508 | 単体 | postgres/client | `createPostgres` が作る Pool に、idle client の切断を模した `error` を emit する | `onConnectionError` を渡した場合と、渡さない場合 | プロセスは落ちない。渡した場合は callback が Error を受け取る。渡さない場合は stderr に記録する (黙って捨てない) | 決定 1 |
| TST-601 | 結合 | build | `npm run build` | `dist` を見る | 4 入口ごとに esm・cjs の js と、`.d.ts`・`.d.cts` がある | 決定 1 |
| TST-602 | 結合 | 型の解決 | `moduleResolution: bundler`・`.js` を付けない consumer | `tsc --noEmit` | 4 入口の型が解決し、エラー 0 | 決定 1 |
| TST-603 | 結合 | 型の解決 | `moduleResolution: NodeNext` の consumer (ESM と CJS) | `tsc --noEmit` | 4 入口が解決し、import は `.d.ts`・require は `.d.cts` を読む | 決定 1 |
| TST-604 | 単体 | 読みやすさ | `src/**/*.ts` (spec を除く) | 行数を数える | 全部 150 行以内。超えたファイル名を列挙する | 決定 1 |
| TST-605 | 単体 | 読みやすさ | 同上 | import と `any` を探す | `.js'` で終わる import・`@/` の import・`any` が 0 件 | 決定 1 |
| TST-606 | 単体 | 読みやすさ | `src` の全ファイル名と export 名 | `__` を探す | 0 件 | 決定 1 |
| TST-607 | 単体 | 読みやすさ | `src` の export 全部 | 直前の行を見る | すべて `/** */` の JSDoc が直前にある | 決定 1 |
| TST-608 | 結合 | 配布 | `npm pack --dry-run` | 中身を読む | dist・README.md・CHANGELOG.md・LICENSE・package.json だけ (spec・fixture を含まない) | 決定 1 |
| TST-609 | 結合 | SDK 無し | SDK を入れていない空の dir に pack した物を入れる | `@igeta/persistence` を import する | 成功する (core が SDK を import しない) | 決定 1 |

## 2. 否定テスト (必須)

| ID | 観点 (手口・境界) | ケース | 期待結果 |
|---|---|---|---|
| TST-701 | サイレント縮退 | `REQUIRE_EMULATOR=1` で emulator が無い | Firestore の suite が落ち、題名に理由が出る。skip で緑にならない |
| TST-702 | サイレント縮退 | `REQUIRE_POSTGRES=1` で `PG_URL` が無い | Postgres の suite が落ちる |
| TST-703 | 取り違え | Firestore の scope を SqlRepository の `save` へ渡す | 普通の Error を投げる。黙って保存しない |
| TST-704 | 上限の境界 | limit ちょうどの件数だけ保存 | `list` が isTruncated false を返す (off-by-one を見る) |
| TST-705 | 社内情報 | library の文書に `C-` + 3 桁の制約 ID を書く | `secret-scan --internal-ids` が落ちる |
| TST-706 | 接続断 | Postgres が止まっている | `findById` は `unavailable`。`unprocessable` や素の Error にならない |
| TST-707 | 列名の不正 | Postgres の `filterFields` が存在しない列名 `no_such` を返し、`list` を呼ぶ | 普通の Error が上がる。空の一覧を黙って返さない |
| TST-708 | Firestore の制約 | Firestore の Tx の中で、書いた後に読んで実行する。Postgres では同じ順で実行する | Firestore は SDK の拒否 (読みは書きの前、という制約) がエラーのまま素通しになる。AppError にしない。Postgres では同じ順で成功する (差の記録) |
| TST-709 | Tx の衝突 | 同じ行を 2 つの Tx が競合して更新し、両方を実行する | Firestore は SDK が Tx を繰り返す (library は再試行を足さない)。Postgres は競合のエラーを素通しにし、部分的な書き込みは残らない |
| TST-711 | 利用者の失敗 | `work` が ECONNRESET 付きの Error を投げる (Firestore・Postgres とも) | `unavailable` に翻訳されず、投げた Error がそのまま届く |

## 3. トレーサビリティ

| 確認 | 結果 |
|---|---|
| ADR-0012 決定 1 (4 入口) | core = TST-101〜119 / testing = TST-211・301〜307 / firestore = TST-401〜406・408 / postgres = TST-501〜502・504〜508 / build = TST-601〜609 |
| ADR-0012 決定 2 (契約が受入条件) | TST-201〜211 を InMemory (TST-301)・Firestore (TST-401)・Postgres (TST-501) で通す |
| 読みやすさ (ADR-0012 の Drivers 1) | 機械で見るのは TST-604〜607 だけ。名前の選び方・1 行に 1 事は評価者が見る |
| 機械で確かめないもの | Kysely で汎用の基底の型が通るか (spike で確かめ、結果をタスク 02 に書く) / 業務語の選び方 |

## 4. テストデータ

| ID | データセット | 生成方法 | 従う決まり |
|---|---|---|---|
| TST-801 | 架空の memo (title は 40 字以内・state は draft か published) | fixture 関数で作る | 個人情報は無い |
| TST-802 | 不変条件を外した保存データ 3 種 (title が 41 字・title が数値・state が `done`) | 各実装の harness で生で書く | 個人情報は無い。テスト後に必ず消す |

## 5. 実装ごとの差 (契約は見ない)

| 実装 | Tx の中で自分の書き込みを読む | 同じ id を 2 つの Tx が書く |
|---|---|---|
| InMemory | 読める | 後で commit した側が勝つ |
| Firestore | 読み → 書きの順を強制する (書いた後の読みは SDK が拒否する。TST-708) | SDK が Tx を再試行する。library は足さない (TST-709) |
| Postgres | 読める | `serializable` で実行し、競合のエラー (SQLSTATE 40001) で失敗する。再試行は呼び出し側が決める。部分的な書き込みは残らない (TST-709) |

契約 C8 が見るのは「読んでから書く」だけで、上の差には触れない。
