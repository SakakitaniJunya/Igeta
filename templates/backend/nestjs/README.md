# backend / nestjs — NestJS + Firestore の雛形 (4 層のモジュラーモノリス)

> **TL;DR**: 意味は [`../hono/README.md`](../hono/README.md) と同じ (入口は経路・認証・本文の上限・CORS で検証を持たない / module の presentation が zod で形を検証 / usecase は `Result` を返す / 意味の検証は domain の値オブジェクト / 他の module は `index.ts` だけ)。違いは **NestJS のデコレータを書く場所を `entries/`・`src/main.ts`・`src/app.module.ts` に閉じ込める**こと。module の 4 層は素の TypeScript で、Nest の controller・guard・filter・module は entries 側が持ち、module の公開面 (`index.ts`) を呼ぶ。DB は Hono と同じ Firestore。`templates/backend/nestjs/` = `apps/<app>/backend/` の鏡。層の向きは `.dependency-cruiser.cjs` の 19 本が落とす。
> - 木に無いファイルは雛形に無い。対のテスト (`*.spec.ts`) は隣。例外は型だけ・test-support・起動の `main.ts`
> - Nest の DI は `@Inject(トークン)` で明示する (`emitDecoratorMetadata` に頼らない。vitest の変換が型メタデータを出さないため)

## Nest の部品をどの層に置くか

| Nest の部品 | 置き場 | 理由 |
|---|---|---|
| `@Controller` (経路・`@Body()`・`@Param()`・`@Query()`) | `entries/__entry__/` | HTTP を知る。値を `unknown` のまま module の公開面へ渡し、返った `HttpResponse` を `entries/http/send-response.ts` で返す |
| `@Injectable` の Guard (`CanActivate`) | `entries/__entry__/` | 認証 (トークン・署名)。検証関数は entry の動的 module `register({ verify })` が `VERIFIER` トークンで注入 |
| Pipe (`ValidationPipe` など) | 置かない | 形の検証は module の presentation の zod。`class-validator` も使わない |
| ExceptionFilter | `entries/http/` | 想定外の例外を `apiError(500)`、経路なしを `apiError(404)` にする (Hono の onError と notFound) |
| `@Module` | `entries/`・`src/app.module.ts` | 配線。module の公開面を `useFactory` で作って provider にする |
| Provider (Firestore) | `entries/database/` | `shared/infrastructure` の `createFirestore` を `FIRESTORE` トークンで出す |
| module の controller (presentation) | `modules/__context__/presentation/` | Nest を知らない素のクラス。値 (`unknown`) → zod → usecase → `HttpResponse` |
| usecase | `modules/__context__/application/` | `@Injectable` を付けない。new は module の `index.ts` |
| repository | `modules/__context__/infrastructure/` | Firestore。`@Injectable` を付けない |
| Interceptor・Middleware | 入口が持つ物 | 本文の上限と CORS は `entries/http/all-exceptions.filter.ts` の `configureHttp(app, { bodyLimit, corsOrigins? })` が担う (`main.ts` と spec が同じ関数を使う) |

## 置き場の規則

- 土台 = 印の無いファイル。印を持たないので `package.json` の name は `backend`、emulator の project は `demo-igeta`
- 1 単位 = `src/entries/__entry__/` と `src/modules/__context__/`。印は Hono 版と同じ (`__context__` 系・`__aggregate__` 系・`__entry__` 系)
- 展開は `igeta expand templates/backend/nestjs/src/modules/__context__ --app <app> --context <kebab> --aggregate <kebab>` (入口は `src/entries/__entry__` に `--entry <kebab>` も渡す)。展開先は path から決まり、既存は上書きしない
- `src/main.ts` と `src/app.module.ts` は module も entry も登録しない。展開後、`app.module.ts` の目印 `// @igeta:register-import`・`-verify`・`-entry` の**上**に、入口の import・verify・`<Entry>EntryModule.register({ verify })` を足す (verify は利用 repo が作って register に渡す。module の公開面は entry module が作るので module の登録は無い)。**目印は消さない**。`igeta check-templates --variant nestjs` が登録後の形を型・テスト・層の規則・build まで検査する
- proxy (署名) や webhook (HMAC) の入口は、`__entry__` を展開して Guard を差し替える
- 利用 repo 側の `templates/` には 1 単位 2 つだけ置けばよい

## 木

役割は 1 行。`modules/` と `shared/` は Hono 版とファイル単位で同一 (`diff -r` で差分 0)。枠を替えるときは `entries/`・`main.ts`・`app.module.ts` だけを書き換える。import は `@/` の絶対パス。

```text
templates/backend/nestjs/                           = apps/<app>/backend/
  package.json                                      name は backend。@nestjs/common・core・platform-express・zod・firestore。build は tsc + tsc-alias
  package-lock.json                                 依存の固定。`npm ci` で再現する (検査もこれで入れる)
  tsconfig.json                                     strict・noUncheckedIndexedAccess・experimentalDecorators・paths `@/*`
  tsconfig.build.json                               build 用 (spec と test-support を除く)
  vitest.config.ts                                  alias `@/`。emulator を使うファイルは順に走らせる
  .dependency-cruiser.cjs                           層の決まり 19 本の正本
  src/
    main.ts                                         起動: Nest を作り、`configureHttp` で本文の上限・CORS を設定して listen (spec 無し)
    app.module.ts                                   ルートの Nest module。database と health を束ねる。登録の目印 `@igeta:register-*` を 3 つ持つ
    app.module.spec.ts                              compile できる・/healthz が 200
    entries/
      http/                                         土台
        send-response.ts                            HttpResponse → express の応答
        send-response.spec.ts                       status・header・本文なし (204)
        all-exceptions.filter.ts                    想定外は 500・経路なしは 404 を apiError で返す。`configureHttp` (本文の上限 413・CORS) もここ
        all-exceptions.filter.spec.ts               機微な値を本文に出さない・413・壊れた JSON は 400 `MALFORMED_REQUEST`・それ以外の 400 (壊れた URL など) は `REQUEST_REJECTED`・CORS
        health.controller.ts                        GET /healthz
        health.controller.spec.ts                   200 と {ok:true}
      database/
        database.module.ts                          FIRESTORE トークンを出す @Global な module
        database.module.spec.ts                     env を渡して provider が解決できる
      __entry__/                                    1 単位
        __entry__.controller.ts                     経路の表。Guard → 本文 `unknown` を module の公開面へ
        __entry__.controller.spec.ts                401・不正な JSON は 400・値の受け渡し (verify と module は偽物)
        __entry__.guard.ts                          VERIFIER で検証し claims を request に載せる (本文は読まない)
        __entry__.guard.spec.ts                     通る・落ちて 401・ヘッダと URL だけ渡す
        __entry__.entry.module.ts                   動的 module (`register({ verify })`)。controller・guard・`VERIFIER`・module の公開面を作る provider を束ねる
        __entry__.entry.module.spec.ts              verify が `register` で渡り、公開面が注入される
    modules/
      __context__/                                  1 単位 (Hono 版とファイル単位で同一)
        index.ts                                    公開面と組み立て
        __context__-module.emulator.spec.ts         公開面 → Firestore を本物の部品で create → list → close
        presentation/
          __aggregate__.controller.ts               Nest を知らない素のクラス。unknown → schema → usecase → HttpResponse
          __aggregate__.controller.spec.ts          全 AppErrorKind の status と code
          __aggregate__.schemas.ts                  zod の schema (本文・id・query) と details
          __aggregate__.schemas.spec.ts             型違い・必須欠け・余計な項目
        application/
          list-__aggregates__.usecase.ts            一覧 (上限の定数・status で絞る)
          list-__aggregates__.usecase.spec.ts       絞り込み・上限で truncated
          create-__aggregate__.usecase.ts           名前から値オブジェクトを作り保存
          create-__aggregate__.usecase.spec.ts      意味の誤りは invalid・保存しない
          close-__aggregate__.usecase.ts            開いている集約を閉じる
          close-__aggregate__.usecase.spec.ts       無い → not_found・閉じ済み → conflict
        domain/
          __aggregate__.ts                          集約 {id, name, status: open|closed}
          __aggregate__.spec.ts                     閉じる・閉じ済みを閉じると失敗
          value-objects/__aggregate__-name.ts       値オブジェクト (長さ 1〜40)
          value-objects/__aggregate__-name.spec.ts  境界値
          errors/__aggregate__-already-closed.error.ts  不変条件違反
          errors/__aggregate__-already-closed.error.spec.ts  kind と message
          ports/__aggregate__.repository.port.ts    保存の口 (型だけ)
        infrastructure/
          firestore-__aggregate__.repository.ts     Firestore の読み書き
          firestore-__aggregate__.repository.emulator.spec.ts  保存・絞り込み・読み戻し
          firestore-scope.ts                        TransactionScope ⇔ Transaction の変換
          firestore-scope.spec.ts                   往復で同じ物
          firestore-transaction-runner.ts           1 usecase = 1 Tx
          firestore-transaction-runner.emulator.spec.ts  失敗で巻き戻る
    shared/                                         Hono 版とファイル単位で同一 (`diff -r` で差分 0)
      domain/
        result.ts                                   Result と ok/err
        result.spec.ts                              ok/err の判別
        app-error.ts                                AppError と kind
        app-error.spec.ts                           kind ごとの生成
        doc-id.ts                                   Firestore の doc id の検査
        doc-id.spec.ts                              `/`・空・長すぎ
        transaction-scope.ts                        Tx の不透明な型 (型だけ)
        transaction-runner.ts                       Tx を張る port (型だけ)
      infrastructure/
        env.ts                                      requireEnv
        env.spec.ts                                 無い・空・ある
        firestore.ts                                Firestore の生成
        firestore.spec.ts                           emulator の有無で設定が変わる
      presentation/
        response.ts                                 HttpResponse (型だけ)
        api-response.ts                             ok / apiError / fail (AppError → 応答)
        api-response.spec.ts                        成功・失敗・kind ごとの status
      test-support/
        emulator.ts                                 describeEmulator・ユニークな id・project `demo-igeta`
```

## 層の決まり (`.dependency-cruiser.cjs` が落とす 19 本)

Hono 版の 18 本と同じ意味で、違いは次の 3 点。

1. `nest-only-in-entries` — NestJS・express・rxjs・reflect-metadata は entries と `main.ts`・`app.module.ts`・`app.module.spec.ts` だけ。型だけの devDependencies (`@types/express` など) も同じ扱いで、dependencyTypes は `npm`・`npm-dev`・`npm-no-pkg` (Hono 版の `hono-only-in-entries` の置き換え)
2. `no-decorator-validation` — `class-validator`・`class-transformer` は使わない (19 本目。zod に 1 本化)
3. `entries-go-through-module-index` — 入口に `main.ts`・`app.module.ts` を含む。`zod-only-in-module-presentation` は `@hono/zod-validator` の項を除く

残りの 15 本 (domain の 2 本、application の 2 本、presentation → application、infrastructure、firestore、ai-sdk、test-support、shared-infrastructure、cross-module、shared-is-a-leaf、module-does-not-import-entries、no-circular、no-orphan-file) は名前も中身も同じ。

## テスト

| 書くもの | 確かめ方 |
|---|---|
| domain・shared/domain | 偽物なしで直接 |
| usecase | port をメモリ上の偽物に |
| repository・Tx runner・公開面 | Firestore エミュレータ (`test:emulator` のときだけ) |
| module の controller・schemas | usecase を偽物にし、状態と本文の対応だけ |
| entries の controller・Guard | `Test.createTestingModule` で組み、supertest で叩く。verify と module の公開面は偽物 |

## API の形

Hono 版と同じ (`{ok:true,item}` / `{ok:true,items,truncated}` / `{ok:false,error:{code,message,details?}}`、経路は `GET /__aggregates__?status=`・`POST /__aggregates__` (201)・`POST /__aggregates__/:id/close`)。`verify` は利用 repo が作り、`app.module.ts` の `imports` で `register({ verify })` に渡す。失敗コードは [`../README.md`](../README.md) の表。
