# backend / hono — Hono + Firestore の雛形 (4 層のモジュラーモノリス)

> **TL;DR**: `templates/backend/hono/` は `apps/<app>/backend/` の鏡で、中の path が同じ。**土台** (印の無いファイル) は最初に 1 回コピーし、**1 単位** (印の付いた `src/entries/__entry__/` と `src/modules/__context__/`) は足すたびに印を置き換えて展開する。module は presentation・application・domain・infrastructure の 4 層で、形の検証は zod を presentation に、意味の検証は domain の値オブジェクトに置く。層の向きは `.dependency-cruiser.cjs` の 18 本が落とす。変種の入口は [`../README.md`](../README.md)。
> - 木に無いファイルは雛形に無い。雛形のファイルには対のテスト (`*.spec.ts`) が隣にある。例外は型だけ (port・`HttpResponse`)、test-support、起動の `src/index.ts`
> - `shared/application/` は今は空なので作らない。要る時に作る

## 置き場の規則

- `templates/backend/hono/` の中の path = `apps/<app>/backend/` の中の path。展開先を別に指定しない
- 土台 = 印の無いファイル。**土台は印を持たない**ので、`package.json` の name は `backend`、emulator の project は `demo-igeta` の固定値。Igeta に土台も置くのは、実アプリが無い Igeta が雛形だけで組み立てて検査するためで、利用 repo が最初にコピーする骨格でもある
- 1 単位 = 印の付いたフォルダ。印を渡した名前に置き換えた path へ展開する (`src/modules/__context__/` に `stock-item` なら `apps/<app>/backend/src/modules/stock-item/`)
- 土台の `src/index.ts` は module も entry も登録しない。展開したあと、コメントの 2 か所に 1 行ずつ足す (module を組む・入口を `app.route` で付ける)
- 利用 repo 側の `templates/` には 1 単位 (`src/entries/__entry__/`・`src/modules/__context__/`) だけ置けばよい。土台はそのアプリ自身

## 印

| 書き方 | 形 | 例 |
|---|---|---|
| `__context__` / `__Context__` / `__contextVar__` | ケバブ / パスカル / キャメル | `stock-item` / `StockItem` / `stockItem` |
| `__aggregate__` / `__Aggregate__` / `__aggregates__` | ケバブ / パスカル / 複数形のケバブ | `location` / `Location` / `locations` |
| `__entry__` / `__Entry__` | ケバブ / パスカル | `admin` / `Admin` |

ケバブはファイル名・URL・文字列にだけ使う。変数名はパスカルかキャメル。パスカルの複数形は無い (一覧は `list-__aggregates__.usecase.ts`)。

## 木

役割は 1 行。テストは隣に 1 行。import は `@/` (= `src/`) の絶対パス。

```text
templates/backend/hono/                             = apps/<app>/backend/
  package.json                                      name は backend。依存 (hono・firestore・zod) と scripts。build は tsc + tsc-alias
  tsconfig.json                                     strict・noUncheckedIndexedAccess・paths `@/*`
  tsconfig.build.json                               build 用 (spec と test-support を除く)
  vitest.config.ts                                  alias `@/`。emulator を使うファイルは順に走らせる
  .dependency-cruiser.cjs                           層の決まり 18 本の正本
  src/
    index.ts                                        組み立て: env → Firestore → healthz → notFound → onError → serve (spec 無し)
    entries/                                        入口 = 経路・認証・本文の上限・CORS。検証は持たない
      http/                                         土台: Hono への変換
        read-body.ts                                本文を上限つきで読み、JSON 構文まで見て unknown で返す
        read-body.spec.ts                           上限超過・空・不正な JSON
        to-response.ts                              HttpResponse → Hono の Response
        to-response.spec.ts                         status・header・本文なし (204)
      __entry__/                                    1 単位
        __entry__.routes.ts                         経路の表。verify middleware → 本文を unknown で module へ
        __entry__.routes.spec.ts                    401・413・不正な JSON は 400・値の受け渡し (verify と module は偽物)
        verify-__entry__.middleware.ts              トークン・署名の検証 → claims (本文は読まない)
        verify-__entry__.middleware.spec.ts         通る・落ちて 401・ヘッダと URL だけ渡す
    modules/
      __context__/                                  1 単位
        index.ts                                    公開面と組み立て (入口と他の module はここだけ通す)
        __context__-module.emulator.spec.ts         公開面 → Firestore を本物の部品で create → list → close
        presentation/                               controller + zod: 形の検証 → VALIDATION_FAILED + details
          __aggregate__.controller.ts               値 (unknown) → schema → usecase → HttpResponse
          __aggregate__.controller.spec.ts          全 AppErrorKind の status と code。usecase は偽物
          __aggregate__.schemas.ts                  zod の schema (本文・id・query) と落ちた項目名の配列 (details)
          __aggregate__.schemas.spec.ts             型違い・必須欠け・余計な項目・status の値
        application/                                usecase: domain の結果 (Result) を返す
          list-__aggregates__.usecase.ts            一覧を読む (上限の定数つき、status で絞る)。上限で truncated
          list-__aggregates__.usecase.spec.ts       絞り込み・上限で打ち切り (port はメモリ上の偽物)
          create-__aggregate__.usecase.ts           名前から値オブジェクトを作り、保存する
          create-__aggregate__.usecase.spec.ts      意味の誤りは invalid・保存しない
          close-__aggregate__.usecase.ts            開いている集約を閉じる (1 usecase = 1 Tx)
          close-__aggregate__.usecase.spec.ts       無い → not_found・閉じ済み → conflict
        domain/                                     集約・値オブジェクト (意味の検証)・port
          __aggregate__.ts                          集約 {id, name, status: open|closed}。操作は新しい実体を返す
          __aggregate__.spec.ts                     閉じる・閉じ済みを閉じると失敗
          value-objects/
            __aggregate__-name.ts                   値オブジェクト (長さ 1〜40)
            __aggregate__-name.spec.ts              境界値
          errors/
            __aggregate__-already-closed.error.ts   不変条件違反のドメインエラー
            __aggregate__-already-closed.error.spec.ts  kind と message
          ports/
            __aggregate__.repository.port.ts        保存の口 (型だけ)
        infrastructure/                             firestore repository
          firestore-__aggregate__.repository.ts     Firestore の読み書き
          firestore-__aggregate__.repository.emulator.spec.ts  保存・絞り込み・読み戻し
          firestore-scope.ts                        TransactionScope ⇔ Firestore Transaction の変換
          firestore-scope.spec.ts                   往復で同じ物
          firestore-transaction-runner.ts           1 usecase = 1 Tx
          firestore-transaction-runner.emulator.spec.ts  失敗で巻き戻る
    shared/
      domain/                                       値と形と port だけ。npm も node の組み込みも使わない
        result.ts                                   Result と ok/err
        result.spec.ts                              ok/err の判別
        app-error.ts                                AppError と kind
        app-error.spec.ts                           kind ごとの生成
        doc-id.ts                                   Firestore の doc id の検査
        doc-id.spec.ts                              `/`・空・長すぎ
        transaction-scope.ts                        Tx の不透明な型 (型だけ)
        transaction-runner.ts                       Tx を張る port (型だけ)
      infrastructure/
        env.ts                                      requireEnv。必須の環境変数が無い・空なら落ちる
        env.spec.ts                                 無い・空・あるの 3 通り
        firestore.ts                                Firestore の生成 (emulator のときは gRPC)
        firestore.spec.ts                           emulator の有無で設定が変わる
      presentation/                                 応答の形。Hono を知らない
        response.ts                                 HttpResponse (型だけ)
        api-response.ts                             ok (成功) / apiError (失敗の本文) / fail (AppError → 応答)
        api-response.spec.ts                        成功・失敗・details・kind ごとの status
      test-support/
        emulator.ts                                 emulator が無ければ skip する describe・ユニークな id・project `demo-igeta`
```

## 検証の分担

| 段 | 置き場 | 見るもの | 落ちたとき |
|---|---|---|---|
| 入口 | `entries/` | 本文の上限と JSON 構文まで。中身は見ない | 413 / 400 |
| 形 | `modules/*/presentation/*.schemas.ts` (zod) | 型・必須・余計な項目・query の形 | 400 `VALIDATION_FAILED` + `details` (項目名の配列) |
| 意味 | `domain/` の値オブジェクト | 長さ・範囲・状態の遷移 | `Result` の失敗 → controller が status にする |

zod は module の presentation だけ。`@hono/zod-validator` は使わない。usecase は `HttpResponse` を返さず、controller が組む。

入口がアプリごとに持つ物 (雛形に入れない): CORS、HEAD の拒否、壊れた `%` の 404。proxy (署名) や webhook (HMAC) の入口は、`__entry__` を展開して verify middleware を差し替える (HMAC は生の本文で確かめる)。

## 層の決まり (`.dependency-cruiser.cjs` が落とす 18 本)

1. `domain-depends-on-shared-domain-only` — domain は自分の domain と shared/domain だけ
2. `domain-is-framework-free` — domain と shared/domain に npm も node の組み込みも入れない
3. `application-does-not-look-outward` — application は infrastructure・presentation・shared/presentation を見ない
4. `application-is-framework-free` — application は Firestore の SDK も Hono も使わない
5. `presentation-goes-through-application` — module の presentation は domain・infrastructure を直接触らない
6. `infrastructure-is-not-presentation` — infrastructure は presentation を知らない
7. `firestore-only-in-infrastructure` — Firestore の SDK は infrastructure (と module の index.ts の型) だけ
8. `ai-sdk-only-in-infrastructure` — LLM の SDK は module の infrastructure だけ
9. `production-does-not-import-test-support` — 本番は test-support を使わない
10. `shared-infrastructure-only-from-infrastructure-and-entries` — shared/infrastructure は module の infrastructure・entries・`src/index.ts` だけ
11. `cross-module-through-index-only` — 他の module へは `index.ts` だけ
12. `entries-go-through-module-index` — entries と `src/index.ts` から module の中へは `index.ts` だけ
13. `shared-is-a-leaf` — shared は modules も entries も知らない
14. `hono-only-in-entries` — Hono は entries と `src/index.ts` だけ
15. `zod-only-in-module-presentation` — zod は module の presentation だけ
16. `module-does-not-import-entries` — module は entries を import しない
17. `no-circular` — 循環なし
18. `no-orphan-file` — どこからも使われないファイルは警告

npm の規則は `(^|/)node_modules/<名前>` から書く (`^hono` と書くと一致せず、規則が効かない)。

## テスト

| 書くもの | テスト | 確かめ方 |
|---|---|---|
| 集約・値オブジェクト・ドメインエラー・shared/domain | 隣の `*.spec.ts` | 偽物なしで直接 |
| usecase | 隣の `*.usecase.spec.ts` | port をメモリ上の偽物にする |
| repository・Tx runner | 隣の `*.emulator.spec.ts` | Firestore エミュレータ (`test:emulator` のときだけ。無ければ skip) |
| 公開面 (`index.ts`) | `__context__-module.emulator.spec.ts` | 本物の部品を組んでエミュレータ越しに |
| controller・schemas | 隣の `*.spec.ts` | usecase を偽物にし、状態と本文の対応だけ |
| 入口の routes・middleware | 隣の `*.spec.ts` | `app.request()`。verify と module の公開面は偽物 |

型だけのファイル (port・`HttpResponse`) と `test-support/` にはテストを書かない。TypeScript は strict・`noUncheckedIndexedAccess`・`any` 禁止。

## API の形

資源は `{id, name, status: 'open'|'closed'}`。

| 項目 | 内容 |
|---|---|
| 成功 | `{ok:true,item}` / `{ok:true,items,truncated}` |
| 失敗 | `{ok:false,error:{code,message,details?}}` (形は `shared/presentation/api-response.ts` だけが作る) |
| 経路の例 | `GET /__aggregates__?status=` (上限は定数、query の形は zod) / `POST /__aggregates__` `{name}` (201) / `POST /__aggregates__/:id/close` (200) |
| code と status | `VALIDATION_FAILED` 400 / `UNAUTHORIZED` 401 / `NOT_FOUND` 404 / 競合は 409 / `UNPROCESSABLE` 422 / `UNAVAILABLE` 503 |
| 認証 | `verify` は利用 repo の `src/index.ts` が作って `create__Entry__Routes` に渡す。`routes.spec` は偽の verify |
