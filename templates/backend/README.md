# backend — 変種の入口 (Hono / NestJS / Rust)

> **TL;DR**: backend の雛形は 3 変種。どれも `templates/backend/<変種>/` = `apps/<app>/backend/` の鏡で、同じ木 (`entries/`・`modules/<context>/` の 4 層・`shared/`) と同じ意味を、それぞれの言語の流儀で写す。DB は Firestore。選ぶ変種のフォルダの README を読む。
> - 土台 (印の無いファイル) は最初に 1 回、1 単位 (印の付いたフォルダ) は足すたびに展開する。利用 repo 側の `templates/` は 1 単位だけでよい

## 変種

| 変種 | フォルダ | 言語・枠 | 層の向きの検査 |
|---|---|---|---|
| Hono | [`hono/`](hono/README.md) | TypeScript + Hono + zod | dependency-cruiser 18 本 |
| NestJS | [`nestjs/`](nestjs/README.md) | TypeScript + NestJS + zod | dependency-cruiser 19 本 |
| Rust | [`rust/`](rust/README.md) | Rust + axum + serde | `tests/architecture.rs` (cargo test) 16 本 |

## 共通の木と意味

| 場所 | 役割 |
|---|---|
| `entries/` | 入口 = 経路・認証 (トークン・署名・HMAC)・本文の上限・CORS。**検証は持たない**。本文は JSON 構文まで見て、型の無い値のまま module の公開面へ渡す |
| `entries/http/` (土台) | 応答の形から、そのフレームワークの応答への変換 |
| `entries/__entry__/` (1 単位) | 経路の表 + 検証 (verify) + そのテスト |
| `modules/<context>/` (1 単位) | 業務の単位。公開面 (`index.ts` / `mod.rs`) だけが外に見える。他の module と入口は公開面だけを通す |
| `presentation/` | controller + 形の検証 (型・必須・余計な項目) → 400 `VALIDATION_FAILED` + `details` (項目名の配列)。HTTP フレームワークを知らない |
| `application/` | usecase。domain の結果 (`Result`) を返す。HTTP の型を返さない |
| `domain/` | 集約・値オブジェクト (意味の検証)・port。外部の crate / npm を使わない |
| `infrastructure/` | Firestore の repository と Tx。SDK はここだけ |
| `shared/{domain,infrastructure,presentation,test-support}` | `Result`・`AppError`・doc id・Tx の port / 環境変数と Firestore の生成 / 応答の形 `HttpResponse`・`ok`・`fail`・`apiError` / テストの道具。`shared/application/` は要る時に作る |

## 共通の API の形

資源 `{id, name, status: 'open'|'closed'}`。操作は list (`GET /__aggregates__?status=`)・create (`POST /__aggregates__`、201)・close (`POST /__aggregates__/:id/close`)。成功 `{ok:true,item}` / `{ok:true,items,truncated}`、失敗 `{ok:false,error:{code,message,details?}}`。

## 共通の決まり

- 土台は印を持たない (`package.json` / `Cargo.toml` の name は `backend`、emulator の project は `demo-igeta`)
- 雛形のファイルには対のテストが隣にある。例外は型だけ・test-support・起動の 1 ファイル
- 層の決まりは変種ごとの検査が落とす。名前と意味は 3 変種で揃えてある
