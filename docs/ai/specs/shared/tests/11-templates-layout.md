---
id: test-templates-layout
title: テスト仕様 — templates/ の木と置き場の検査 (棚卸し・移行表・登録制)
type: design
kind: test-spec
context: shared
arc42: 10
id_prefix: TST
status: draft
canonical: true
owners: [eng]
created: 2026-10-22
depends_on: [adr-0014-templates-tree]
relates_to: [test-init-scaffold]
---

# テスト仕様 — templates/ の木と置き場の検査 (棚卸し・移行表・登録制)

> **TL;DR**: ADR-0014 の木 (`backend/`・`frontend/`・`mobile/`・`docs/`・`.github/`) を、棚卸し・点検結果・移行表・規則 L1〜L8・テストで固定する。第 1・第 2 階層は登録制、各雛形の中は `igeta-check-layout`、旧世代と `igeta scaffold` は退役。
> - 違反の件数は check-layout の実測 (hono 2・nestjs 3・frontend 5・api-shared-kernel 2・api-module と web-feature は 0)。rust・ios・store-screenshots は ts でないので手で当てた
> - `igeta expand` の UNITS と `check-templates` の matrix は変えない

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [ADR-0014](../../../../person/decisions/2026/0014-templates-tree.md) 決定 1〜5 | ADR-0014 |
| 関連 | [06 init・scaffold](./06-init-scaffold.md) (I10・I13・TST-109 を退役に合わせて直す) | I10・I13 |
| 下流 | `src/checks/TemplatesLayoutCheck.ts` (新)・`library/eslint-config/check-layout.js`・`.github/workflows/ci.yml` | TST-* |

## 0. 規則

| # | 規則 |
|---|---|
| L1 | `templates/` の直下は登録名 (`.github`・`backend`・`docs`・`frontend`・`mobile`・`README.md`) だけで、8 エントリ以内。登録外・登録して実体の無い名前は違反 |
| L2 | 第 2 階層も登録制: `backend` = hono・nestjs・rust / `frontend` = admin / `mobile` = ios。登録外は違反 |
| L3 | 登録した `backend`・`frontend` の変種は、`check-templates` の `ALL_VARIANTS` と過不足なく一致する。自己検査が無い変種 (`mobile/ios`) は、登録に理由 (macOS が要る) を書いた物だけ許す |
| L4 | 各雛形の中は `igeta-check-layout` を通す (MD-11)。rs・swift・mjs は引数 `--ext rs,swift,mjs` で足す (既定は ts・tsx のまま。`library/eslint-config` は minor 版で出し、既存の利用 repo は版を上げても新しく落ちない)。`*_test.rs`・`*Tests.swift` は本体に数えず、`mod.rs` は `index.ts` と同じ扱い |
| L5 | 禁止名 `shared` は、直下の子が層 (domain・application・infrastructure・presentation) と `test-support` (rust は `test_support`) だけで、直下の本体は `index.ts`・`mod.rs` だけのときに許す。他の禁止名は例外なし。rust の `src/shared` は `mod.rs` と層 3 つ + `test_support` で、この形に当たる |
| L6 | ファイル名に、置かれたフォルダが言う名前を繰り返さない (`<feature>/domain/model.ts`)。接頭辞の共有は L4 が機械で、繰り返しの有無は人が見る |
| L7 | 退役した名前 (`api-module`・`api-shared-kernel`・`web-feature`・`ios-app`・`store-screenshots`) は `templates/` の直下に戻せない (L1 が落とす)。`scaffold` コマンドと、`igeta init` が書く `scaffold` の npm script も無い |
| L8 | (補助。機械では落とせない) 雛形を足す・替える PR は、同じ PR で置き換わる物を退かせる。退かせる物が無いときは PR の説明に理由を書く。主な歯止めは L1・L2 の登録制で、L8 は AGENTS.md に書く |

## 1. 棚卸し (templates/ 直下 10 個)

| 名前 | 世代 | 足した PR | 参照元 (実測) | 判定 |
|---|---|---|---|---|
| `.github/` | 現行 | #12 (9eab7d5) | `src` から読む所なし。`templates/README.md` の表にも無い | 残す。README の表に足す |
| `README.md` | 現行 | 未取得 | 入口 | 残す (実装で直す) |
| `docs/` | 現行 | 初回 commit ffbfc68 (PR 無し) | `InitCommand.ts:201` (`templates/docs/…`)・README 表 | 残す |
| `backend/{hono,nestjs,rust}` | 現行 | #21 (4c9d567) | `TemplateExpandModule.ts` (UNITS・templateBaseDir)・`TemplatesCheck.ts:104`・`templates.yml`・README 表 | 残す |
| `frontend/admin` | 現行 | #21 (4c9d567) | 同上 | 残す |
| `ios-app` | 現行 | #9 (1e2b00d) | `templates/README.md:14` だけ。`src`・CI・`.igeta.json` から読まれない | `mobile/ios` へ移す |
| `api-module` | 旧 | 初回 commit ffbfc68 (PR 無し) | `ScaffoldModule.ts:113` だけ (+ README.md:28・332) | 退役 |
| `api-shared-kernel` | 旧 | 初回 commit ffbfc68 (PR 無し) | `ScaffoldModule.ts:115` だけ。`common/`・`shared/` を持つ | 退役 |
| `web-feature` | 旧 | 初回 commit ffbfc68 (PR 無し) | `ScaffoldModule.ts:110` だけ (Next.js) | 退役 |
| `store-screenshots` | 道具 | #7 (12533ed) | README.md:29・templates/README.md:13 だけ。`src`・CI から読まれない | `tools/` へ出す |

足した PR は `git log` の実測。旧世代 3 つと docs は公開時の初回 commit から在った。旧世代は `scaffold` が読むので「参照が無い」ではなく、**読む物ごと退役する**。

## 2. 点検結果 (CEO の問い: 直下に直接書かれた平置きか)

| 雛形 | 平置きか | 違反 | 根拠 |
|---|---|---|---|
| `backend/hono` | No (4 層に分かれている) | 2 | `src/shared` が禁止名 / `infrastructure/` に `firestore-*` が 3 本 |
| `backend/nestjs` | No | 3 | 上の 2 つ + `entries/__entry__/` に `__entry__.*` が 3 本 (controller・entry.module・guard) |
| `backend/rust` | No | 1 (L5 で 0) | `src/shared` のみ (`mod.rs` + 層 3 つ + `test_support`)。`firestore_repository`・`firestore_tx` は 2 本 (`_test` は数えない) |
| `frontend/admin` | No | 5 | `shared` / `features/__feature__/domain` の `__feature__.*` 3 本 / 同 `infrastructure` 3 本 / `shared/application` の `use-*` 4 本 / `shared/presentation/ui` に本体 9 本 |
| `ios-app` | **Yes (層が無い)** | 0 | `__NAME__/` に `App`・`Models`・`RootView` の 3 本 (13・16・33 行) が直置き。規約の数字は超えない。層は 2 画面目が要るときに切る |
| `api-module` | No | 0 | 4 層。退役 |
| `api-shared-kernel` | No | 2 | `src/common`・`src/shared`。退役 |
| `web-feature` | No | 0 | 退役 |
| `store-screenshots` | No | 0 | 手で当てた。`scripts/` 5 本・`editor/scripts/` 3 本 |

答え: 現行の `backend`・`frontend` は層で分かれていて、平置きではない。ただし各 `shared/` と `firestore-*`・`__feature__.*`・`use-*`・`ui/` の 9 本が MD-11 の違反。平置きに近いのは `ios-app` だけ。

## 3. テストケース一覧

| ID | 層 | 対象 | 前提 (Given) | 操作 (When) | 期待結果 (Then) | 対応 |
|---|---|---|---|---|---|---|
| TST-101 | 結合 | 根の登録 | 移行後の `templates/` | `npm run check:templates-layout` | 直下 6 エントリで違反 0 | L1 |
| TST-102 | 結合 | 第 2 階層 | 同上 | 同上 | `backend` の子が hono・nestjs・rust、`frontend` が admin、`mobile` が ios で違反 0 | L2 |
| TST-103 | 結合 | matrix 一致 | `ALL_VARIANTS` と登録 | 同上 | 過不足 0。`mobile/ios` は理由つきで除外 | L3 |
| TST-104 | 結合 | 雛形の中 | hono・nestjs・frontend・rust | `igeta-check-layout` を各根に | 全部 exit 0 (今は 2・3・5・1 件) | L4 |
| TST-105 | 結合 | shared の例外 | 子が domain・infrastructure・presentation・test-support の `src/shared` / rust の `mod.rs` + 層 + `test_support` | check-layout | 落ちない | L5 |
| TST-106 | 結合 | 退役 | 移行後のツリーと `src` | `check:templates-layout`・`tsc`・`npm test` | `scaffold` の import・コマンド・npm script が 0。`igeta init` の出力に `scaffold` が無い | L7 |
| TST-107 | 結合 | expand の維持 | 移行後 | `ExpandCommand.test`・`TemplateExpandModule.test`・`TemplatesInstantiation.test` (hooks・ui の import 変更を含む)・`check-templates` | 緑。UNITS の 3 つは同じ path | 決定 4 |
| TST-108 | 結合 | 移した先 | `mobile/ios` | README の手順どおり置換 → `xcodegen generate` | 手で確認 (macOS)。結果を PR に書く | 決定 3 |

## 4. 否定テスト (必須)

| ID | 観点 (手口・境界) | ケース | 期待結果 |
|---|---|---|---|
| TST-301 | 足して退かさない | `templates/` 直下に `android-app/` を足す | 登録外で落ちる (L1) |
| TST-302 | 退役の復活 | `templates/api-module/` を戻す | 落ちる (L1・L7) |
| TST-303 | 9 個目 | 登録を 9 個にする | 上限 8 で落ちる |
| TST-304 | 登録だけ足す | `mobile/android` を登録して実体を置かない | 実体が無くて落ちる (L2) |
| TST-305 | 変種の matrix 抜け | `backend/go` を登録・実体ありで、`ALL_VARIANTS` に足さない | 落ちる (L3) |
| TST-306 | shared に袋 | `src/shared/` の直下に `helpers.ts` を置く / 子に `misc/` を置く | 落ちる (L5) |
| TST-307 | 他の禁止名に例外が移る | `src/utils/` を置く | 落ちる (例外は `shared` だけ) |
| TST-308 | 接頭辞を別の拡張子で隠す | `infrastructure/` に `firestore_a.rs`・`firestore_b.rs`・`firestore_c.rs` | 落ちる (L4) |
| TST-309 | 名前を変えて隠す | 退役したフォルダを `legacy-api/` に改名して残す | 登録外で落ちる (L1) |
| TST-310 | node_modules | 雛形の `node_modules/` の中に深い違反 | 数えない (今の check-layout と同じ) |

## 5. 移行表

### 5.1 第 1 階層

| 旧 | 新 | 更新が要る参照 |
|---|---|---|
| `templates/api-module/` `api-shared-kernel/` `web-feature/` | 削除 | `src/generators/ScaffoldModule.ts`・`ScaffoldModule.test.ts`・`src/cli/commands/ScaffoldCommand.ts`・`src/cli.ts:25,58`・`InitCommand.ts:39`・`InitCommand.test.ts:292`・`TemplateExpandModule.test.ts:108,118`・`package.json:37`・`README.md:28,242,297,332-334` (242 は init が配る npm scripts の一覧)・`templates/README.md:8-10,16`・`templates/docs/ai/handbook/how-to/02-implementation-order.md:16,26,46,82` (利用 repo へ配られる。`scaffold:module`・`templates/api-module`・`--include-kernel` を `igeta expand templates/backend/<変種>/src/modules/__context__ --app <app> --context <c> --aggregate <A>` と、土台は手でコピー、に置き換える)・`06-init-scaffold.md` (I10・I13・test-init-scaffold/TST-109)・`docs/person/design/shared/00-map.md:49` (scaffold の説明が実装と食い違う)・`docs/README.md:44` |
| `templates/ios-app/` | `templates/mobile/ios/` | `templates/README.md:14`・`ios-app/README.md` の自己参照 2 箇所 |
| `templates/store-screenshots/` | `tools/store-screenshots/` | `README.md:29`・`templates/README.md:13`・`package.json` の `files` に `tools`。中の参照は写し先 (repo ルート) 基準なので変えない (実装で確認) |
| `templates/backend/**`・`frontend/**`・`docs/**`・`.github/**` | 動かさない | `templates.yml` の paths・cache key・`rust-toolchain` の path は変更なし |

### 5.2 雛形の中 (L4・L5・L6)

| 旧 | 新 | 更新が要る参照 |
|---|---|---|
| hono・nestjs `infrastructure/firestore-<aggregate>.repository.ts`・`firestore-scope.ts`・`firestore-transaction-runner.ts` (+ spec) | `infrastructure/firestore/<aggregate>.repository.ts`・`scope.ts`・`transaction-runner.ts` | module の `index.ts`・`*-module.emulator.spec.ts`・各 README の木・dependency-cruiser (`/infrastructure/` の前方一致は変わらない) |
| nestjs `entries/__entry__/__entry__.{controller,entry.module,guard}.ts` | `entries/__entry__/{controller,entry.module,guard}.ts` | `app.module.ts`・`TemplateRegistration.ts` の登録の行 |
| frontend `domain/__feature__.{model,rules,validation}.ts`・`infrastructure/__feature__.{dto,endpoint,mapper}.ts` | `domain/{model,rules,validation}.ts`・`infrastructure/{dto,endpoint,mapper}.ts` | `features/__feature__/index.ts`・`routes.ts`・`TemplateRegistration.ts` |
| frontend `shared/application/use-{api,mutation-flow,navigate,resource}` (4 本が `use` を共有。shared の例外では救えない) | `shared/application/hooks/{api,mutation-flow,navigate,resource}` (接頭辞 `use-` を落とす。hook の名前 `useApi` 等は変えない) | 全 feature の import (`@/shared/application/…`) |
| frontend `shared/presentation/ui/` 本体 9 本 > 7 (shared の例外では救えない) | 2〜3 のまとまりに分ける。案: `ui/state/` (EmptyState・ErrorView・LoadingView・FormErrorBanner・SaveErrorBanner) / `ui/control/` (DateField・ConfirmDialog) / `ui/label/` (CountLabel・StatusBadge)。各 7 本以下 | 全 feature の import |
| 全変種の `src/shared/` (rust は `mod.rs` + 層 + `test_support` のまま) | 名前を変えず L5 の例外で通す | `check-layout.js` の禁止名の判定のみ |

## 6. トレーサビリティ

| 確認 | 結果 |
|---|---|
| ADR との対応 | 決定 1 = L1・L2 / 決定 2 = L7 / 決定 3 = 5.1 / 決定 4 = L4〜L6・5.2 / 決定 5 = L1〜L3・L8 |
| 実装の分割 (順序) | PR-1 退役 (scaffold と旧 3 つ。06 を直す) → PR-2 移動 (ios・store-screenshots・README) → PR-3a/3b/3c 雛形の中 (node backend・frontend・check-layout の拡張子と shared 例外) を並行 → PR-4 登録制の検査・CI・AGENTS.md。PR-4 を最後にして緑のまま入れる。検査は `docs:check` に入れない (`docs:check` は利用 repo でも走り、そこに `templates/` は無い)。Igeta 自身の repo だけで走る npm script `check:templates-layout` を作り、`ci.yml` (全 push・PR で走る `check` ジョブ。secret-scan・tsc・test・docs:check の step がある) に step を足す。`templates.yml` は paths 絞りなので必須にしない |
| 機械で確かめないもの | L6 (名前の繰り返し) / L8 (補助。人と AGENTS.md) / `mobile/ios` の動作 (macOS) / 5.1 の store-screenshots 中身の参照 |
| 前提 | rust・ios・store-screenshots の件数は手計算 (check-layout は ts だけ数える)。`igeta init` が書く `scaffold` の script を使う既存の利用 repo の数は不明 |
