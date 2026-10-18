# backend — 変種の入口 (Hono / NestJS / Rust)

> **TL;DR**: backend の雛形は 3 変種。どれも `templates/backend/<変種>/` = `apps/<app>/backend/` の鏡で、同じ木 (`entries/`・`modules/<context>/` の 4 層・`shared/`) と同じ意味を、それぞれの言語の流儀で写す。DB は Firestore。選ぶ変種のフォルダの README を読む。
> - 土台 (印の無いファイル) は最初に 1 回、1 単位 (印の付いたフォルダ) は足すたびに `igeta expand` で展開する。利用 repo 側の `templates/` は 1 単位だけでよい
> - 変種を足したら `igeta check-templates` が展開・登録・型・テスト・層の規則・build まで通す

## 変種

| 変種 | フォルダ | 言語・枠 | 層の向きの検査 |
|---|---|---|---|
| Hono | [`hono/`](hono/README.md) | TypeScript + Hono + zod | dependency-cruiser 18 本 |
| NestJS | [`nestjs/`](nestjs/README.md) | TypeScript + NestJS + zod | dependency-cruiser 19 本 |
| Rust | [`rust/`](rust/README.md) | Rust + axum + serde | `tests/architecture.rs` (cargo test) 16 本 |

## 展開と検査

- 展開: `igeta expand templates/backend/<変種>/src/modules/__context__ --app <app> --context <kebab> --aggregate <kebab>` (入口は `src/entries/__entry__` に `--entry <kebab>` も渡す)。展開先は path から決まる (変種の段を落として `apps/<app>/backend/…`)。既存は上書きせず、1 件でも違反なら 1 ファイルも書かない
- 登録: 展開後に足す行は、土台の `@igeta:register-*` の目印の上に足す。目印は消さない。行の内容は変種の README の「置き場の規則」
- 検査: `igeta check-templates [--variant hono|nestjs|rust|frontend] [--require-emulator]`。変種ごとに土台と固定名 (`sample`・`item`・`probe`) の 1 単位を一時 dir に展開・登録し、`npm ci` (rust は `cargo build --locked`) → 型 → テスト → 層の規則 → build を通す。Java・cargo と Docker のどちらかが無ければ exit 2 (検査不能)
- 変種を足すとき: 土台に目印を置き、`src/generators/TemplateRegistration.ts` の登録の表と `src/checks/templatesSteps.ts` の手順表に 1 変種分を足す。目印が 1 つだけあることは `npm test` が見る

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

失敗コード (3 変種で同じ文字列)。kind の行は Hono の `shared/presentation/api-response.ts` の表と一致させてある。

| 段 | 条件 | status | code |
|---|---|---|---|
| 入口 | 本文が上限超過 | 413 | `PAYLOAD_TOO_LARGE` |
| 入口 | JSON の構文が壊れている | 400 | `MALFORMED_REQUEST` (本文の JSON 構文エラーだけ。NestJS の他の 400 や壊れた `%` の URL は `REQUEST_REJECTED`。Hono は壊れた `%` を入れていない。扱いはアプリごと) |
| 入口 | その他の 4xx (405・415 など。NestJS だけが出す) | 各 status | `REQUEST_REJECTED` |
| 形 | zod / serde の検証に落ちた | 400 | `VALIDATION_FAILED` (`details` = 項目名の配列) |
| 意味 | kind `invalid` | 400 | `INVALID_REQUEST` |
| 意味 | kind `unauthorized` | 401 | `UNAUTHORIZED` |
| 意味 | kind `not_found` | 404 | `NOT_FOUND` |
| 意味 | kind `conflict` | 409 | `CONFLICT` |
| 意味 | kind `unprocessable` | 422 | `UNPROCESSABLE` |
| 意味 | kind `unavailable` | 503 | `UNAVAILABLE` |

404 (経路なし) と 500 (想定外) の message は 3 変種で揃える: `route not found` / `internal server error`。

## 共通の決まり

- 土台は印を持たない (`package.json` / `Cargo.toml` の name は `backend`、emulator の project は `demo-igeta`)
- 雛形のファイルには対のテストが隣にある。例外は型だけ・test-support・起動の 1 ファイル
- 層の決まりは変種ごとの検査が落とす。名前と意味は 3 変種で揃えてある
