# backend / rust — axum + Firestore の雛形 (4 層のモジュラーモノリス)

> **TL;DR**: 意味は [`../hono/README.md`](../hono/README.md) と同じ。axum は `entries/` に閉じ込め、module は Rust の `mod` と `trait` (port) で 4 層に切る。形の検証は serde (`Deserialize`) を module の presentation に置き、落ちたら `VALIDATION_FAILED` + `details`。意味の検証は domain の値オブジェクト。Firestore は `firestore` crate (abdolence/firestore-rs)。`templates/backend/rust/` = `apps/<app>/backend/` の鏡。**dependency-cruiser が使えない**ので、層の向きは `tests/architecture.rs` (cargo test) が `use crate::` と外部 crate の path を読んで落とす。
> - 木に無いファイルは雛形に無い。テストは隣: 単体は同じファイル末尾の `#[cfg(test)] mod tests`、入口と Firestore の統合テストは対象の隣の `*_test.rs` (`#[cfg(test)] mod …_test;` で取り込む)。`tests/` は `architecture.rs` だけ。例外は型だけ (port・`HttpResponse`)・`mod.rs` の再 export・`test_support/`・起動の `main.rs`
> - 印はスネーク形で渡す (`stock_item`・`location`)。Rust の `mod` 名がケバブにできないため

## Hono 版との対応

| Hono 版 | Rust 版 |
|---|---|
| `entries/` (Hono) | `entries/` (axum の `Router`。本文の上限は `http-body-util` の `Limited` と content-length の事前確認で、413 を JSON 本文で返す。handler の panic は `tower-http` の `catch-panic` (`entries/http/catch_panic.rs`) を `main.rs` が app 全体に掛け、500 `INTERNAL_ERROR` で返す (Hono の onError)。CORS はアプリごと) |
| module の controller + zod | `presentation/` の `controller.rs` + `schemas.rs` (serde の `Deserialize` を `serde_json::Value` から変換 (`serde_path_to_error`)。本文と id の余計な項目は落とし、query の未知の項目は黙って捨てる (verify の `shop`・`signature` などが付くため)。`details` は最初に落ちた 1 項目だけ。Hono は複数) |
| port (型) | `domain/ports.rs` の `trait`。usecase はジェネリクスで受ける (動的ディスパッチにしない)。Tx の port はクロージャ `Fn(Item) -> Result<Item, DomainError> + Send + Sync + 'static` を受け (`run_transaction` が衝突時に呼び直し `'static` を要るため `FnOnce` ではない)、失敗は `TransitionError { NotFound, Domain, Store }` |
| module の公開面 | `ContextModule` は trait。`create_module(db)` が `impl` を返す (統合テストで偽物を差すため) |
| `Result` / `AppError` | `shared/domain` の `AppResult<T> = Result<T, AppError>` と `AppError { kind, message, detail }` |
| `HttpResponse` | `shared/presentation/response.rs` の `HttpResponse { status, body: serde_json::Value, headers }`。axum を知らない |
| `describeEmulator` | `shared/test_support/emulator.rs` と module の `firestore_repository_test.rs`・`module_test.rs` (`FIRESTORE_EMULATOR_HOST` が無ければ即 return。`REQUIRE_EMULATOR=1` なら落とす) |
| dependency-cruiser | `tests/architecture.rs` |

## 置き場の規則

- 土台 = 印の無いファイル。印を持たないので `Cargo.toml` の name は `backend`、emulator の project は `demo-igeta`
- 1 単位 = `src/entries/__entry__/` と `src/modules/__context__/`。展開したあと `pub mod <unit>;` を `src/entries/mod.rs` と `src/modules/mod.rs` に足し (場所はコメントで示してある。`lib.rs` は変えない)、`src/main.rs` の 2 か所を足す
- 入口と Firestore のテストは 1 単位の中 (`entries/__entry__/routes_test.rs`・`modules/__context__/infrastructure/firestore_repository_test.rs`・`modules/__context__/module_test.rs`) にあり、`crate::shared::test_support` を使う。**土台だけでも `cargo build` と `cargo test` が丸ごと通る** (展開前は 1 単位が無いのでそのテストも無い)。`*_test.rs` は `tests/architecture.rs` の本番の規則から外す。依存は `Cargo.lock` で固定し `--locked` で再現する
- 入口がアプリごとに持つ物: CORS の許可元、HEAD の拒否、壊れた `%` の 404。壊れた `%` や不正な UTF-8 は serde_urlencoded が落とさず通す (実測)。クエリで落ちるのは形の検証 (`VALIDATION_FAILED`) だけ。proxy (署名)・webhook (HMAC) の入口は `__entry__` を展開して `verify.rs` を差し替える
- 利用 repo 側の `templates/` には 1 単位 2 つだけ置けばよい

## 木

```text
templates/backend/rust/                             = apps/<app>/backend/
  Cargo.toml                                        name は backend。axum・firestore・http-body-util・serde・serde_json・serde_path_to_error・serde_urlencoded・tokio・tower-http (catch-panic)・uuid。dev は tower
  Cargo.lock                                        土台。`--locked` で再現する
  rust-toolchain.toml                               toolchain の固定
  src/
    main.rs                                         組み立て: env → Firestore → /healthz → fallback 404 → panic は 500 (catch_panic_layer) → serve (テスト無し)
    lib.rs                                          `pub mod entries; pub mod modules; pub mod shared;` (展開で変えない)
    entries/
      mod.rs                                        再 export。展開後に `pub mod <entry>;` を足す場所
      http/
        mod.rs                                      再 export
        read_body.rs                                本文を上限つきで読み、JSON 構文まで見て Value で返す
        to_response.rs                              HttpResponse → axum の Response
        catch_panic.rs                              handler の panic → 500 INTERNAL_ERROR の JSON (`tower-http` catch-panic の layer)
      __entry__/                                    1 単位
        mod.rs                                      `routes(deps) -> Router`
        routes.rs                                   経路の表。verify layer → 本文を Value のまま module の公開面へ
        verify.rs                                   トークン・署名の検証 (trait Verifier を注入) → claims
        routes_test.rs                              (展開後のみ) 401・413・不正な JSON は 400・値の受け渡し・余計な query が付いても渡る (verify と module は偽物)
    modules/
      mod.rs                                        再 export。展開後に `pub mod <context>;` を足す場所
      __context__/                                  1 単位
        mod.rs                                      公開面 (trait `ContextModule`・`create_module(db)` が impl を返す)。他はここだけ通す
        module_test.rs                              (展開後のみ) 公開面 → Firestore で create → list → close (emulator のときだけ)
        presentation/
          mod.rs                                    再 export
          controller.rs                             Value → schema → usecase → HttpResponse
          schemas.rs                                serde の型 (本文・id・query。query は未知の項目を捨てる) と落ちた項目名 (serde が最初の 1 件で止まるため 1 項目)
        application/
          mod.rs                                    再 export
          list.rs                                   一覧 (上限の定数・status で絞る)
          create.rs                                 名前から値オブジェクトを作り保存
          close.rs                                  開いている集約を閉じる
        domain/
          mod.rs                                    再 export
          __aggregate__.rs                          集約 {id, name, status: Open|Closed}
          name.rs                                   値オブジェクト (長さ 1〜40)
          errors.rs                                 不変条件違反 (閉じ済みを閉じる)
          ports.rs                                  repository の trait と Tx の port (クロージャ `Fn(Item) -> Result<Item, DomainError> + Send + Sync + 'static`、`TransitionError`)。型だけ
        infrastructure/
          mod.rs                                    再 export
          firestore_repository.rs                   Firestore の読み書き (doc の型は `firestore_tx.rs` から使う)
          firestore_repository_test.rs              (展開後のみ) 保存・絞り込み・読み戻し (emulator のときだけ)
          firestore_tx.rs                           1 usecase = 1 Tx (`run_transaction`)。doc の型 (`ItemDoc`・`StatusDoc`・`COLLECTION`) もここ (repository と互いに import して循環になるため)
    shared/
      mod.rs                                        再 export
      domain/
        mod.rs                                      再 export
        app_error.rs                                AppError と kind
        result.rs                                   AppResult
        doc_id.rs                                   doc id の検査
      infrastructure/
        mod.rs                                      再 export
        env.rs                                      require_env。無い・空なら落ちる
        firestore.rs                                FirestoreDb の生成 (emulator のときは接続先を切り替える)
      presentation/
        mod.rs                                      再 export
        response.rs                                 HttpResponse (型だけ)
        api_response.rs                             ok / api_error / fail (AppError → 応答)
      test_support/
        mod.rs                                      `#[cfg(test)]` で公開
        emulator.rs                                 emulator が無ければ skip・ユニークな id・project `demo-igeta`
  tests/
    architecture.rs                                 層の向きの規則 (下)。これだけが `tests/` にある
```

単体テストの中身 (同じファイルの末尾): `read_body.rs` は上限超過・空・不正な JSON、`to_response.rs` は status・header・204、`catch_panic.rs` は panic が 500 `INTERNAL_ERROR`、`verify.rs` は通る・落ちて 401、`controller.rs` は全 `AppErrorKind` の status と code、`schemas.rs` は型違い・必須欠け・余計な項目 (query は未知の項目を無視)、`list.rs`/`create.rs`/`close.rs` は偽の repository で結果、`__aggregate__.rs`/`name.rs`/`errors.rs` は境界値と遷移、`app_error.rs`/`doc_id.rs`/`env.rs`/`api_response.rs` は表で直接。

## 層の決まり (`tests/architecture.rs` が落とす 16 本)

`src/` の全 `.rs` (`*_test.rs` を除く) を読み、各ファイルの `use crate::...`・`crate::...` の path と外部 crate の `use`/path を取り出す。`#[cfg(test)]` 以降の行は本番の規則から外す。

1. `domain-depends-on-shared-domain-only` — domain は自分の domain と `shared::domain` だけ
2. `domain-is-framework-free` — domain は `std` 以外の crate を使わない (serde も不可)
3. `application-does-not-look-outward` — application は infrastructure・presentation・`shared::presentation` を見ない
4. `application-is-framework-free` — application は firestore・axum・tower・serde (serde_json・serde_urlencoded を含む) を使わない
5. `presentation-goes-through-application` — presentation は domain・infrastructure を直接触らない
6. `infrastructure-is-not-presentation` — infrastructure は presentation を知らない
7. `firestore-only-in-infrastructure` — `firestore` crate は module の infrastructure・`shared::infrastructure`・module の `mod.rs` (型を受ける所) だけ
8. `production-does-not-import-test-support` — `test_support` は `#[cfg(test)]` の中だけ
9. `shared-infrastructure-only-from-infrastructure-and-entries` — `shared::infrastructure` は module の infrastructure・entries・`main.rs` だけ
10. `cross-module-through-mod-only` — 他の module へは `modules::<x>::` の直下 (公開面) だけ
11. `entries-go-through-module-mod` — entries と `main.rs` から module の中へは `mod.rs` の公開面だけ
12. `shared-is-a-leaf` — shared は modules も entries も知らない
13. `axum-only-in-entries` — axum と tower は entries と `main.rs` だけ
14. `serde-only-in-presentation-and-infrastructure` — serde は module の presentation・infrastructure、`shared::presentation` だけ
15. `module-does-not-import-entries` — module は entries を使わない
16. `no-circular` — `mod` 間の `use` に循環なし (グラフを作って検出)

使われないファイルの警告は `rustc` の `dead_code` に任せる。

## API の形

Hono 版と同じ (`{ok:true,item}` / `{ok:true,items,truncated}` / `{ok:false,error:{code,message,details?}}`、経路は `GET /__aggregates__?status=`・`POST /__aggregates__` (201)・`POST /__aggregates__/:id/close`)。`verify` は利用 repo の `main.rs` が作って `routes(deps)` に渡す。
