# frontend — React + Vite + TypeScript の管理画面の雛形 (4 層)

> **TL;DR**: `templates/frontend/admin/` は `apps/<app>/frontend/admin/` の鏡で、中の path が同じ。**土台** (印の無いファイル) は最初に 1 回コピーし、**1 単位** (印の付いた `src/features/__feature__/`) は足すたびに印を置き換えて展開する。feature は backend の module と同じ 4 層 (presentation・application・domain・infrastructure) で、`shared/` も同じ 4 層。共通機能と部品の既定の置き場は `shared/`。向きは `.dependency-cruiser.cjs` の 12 本が落とす。
> - 木に無いファイルは雛形に無い。雛形のファイルには対のテスト (`*.test.ts(x)`) が隣にある。例外は型だけ (dto・`shared/domain/api.ts`)、再 export だけ (`index.ts`)、起動の 1 行 (`main.tsx`・`test-support/`)
> - 画面は空・読み込み中・エラーの 3 状態を必ず出す。経路の正本は `app/routes.ts`

## 置き場の規則

- `templates/frontend/admin/` の中の path = `apps/<app>/frontend/admin/` の中の path。展開先を別に指定しない
- 土台 = 印の無いファイル (`shared/`・`app/`・`main.tsx`・package.json・tsconfig・vite 設定・`.dependency-cruiser.cjs`)。Igeta に土台も置くのは、実アプリが無い Igeta が雛形だけで組み立てて検査するためで、利用 repo が最初にコピーする骨格でもある
- 1 単位 = `src/features/__feature__/` だけ。`__Component__` の印は無い。共通の部品は `shared/presentation/ui/` の state・control・label に分けて置く
- 展開は `igeta expand templates/frontend/admin/src/features/__feature__ --app <app> --feature <kebab>`。展開先は path から決まり、既存は上書きしない
- 展開したあと、`src/app/routes.ts` の目印 `// @igeta:register-import` の上に `import { <Feature>Screen } from '@/features/<feature>';`、`// @igeta:register-route` の上に `{ path: '/<feature>', screen: <Feature>Screen },` を足す。**目印は消さない**。`igeta check-templates --variant frontend` が登録後の形を型・テスト・層の規則・`vite build` まで検査する (Node は `engines` の 22 か 24 で走らせる。Node 25 は組み込みの `localStorage` が jsdom のものを隠して `session.test.ts` が落ちることを実測した)
- 利用 repo 側の `templates/` には 1 単位 (`src/features/__feature__/`) だけ置けばよい。土台はそのアプリ自身
- 案件固有の枠 (拠点の切替など) は雛形に置かない。feature をまたぐ合成は `app/` だけ

## 印

| 書き方 | 形 | 例 |
|---|---|---|
| `__feature__` / `__Feature__` | ケバブ / パスカル | `locations` / `Locations` (API のパスにも使う) |

ケバブはファイル名・URL・文字列にだけ使う。変数名はパスカルかキャメル。土台は印を持たない (`package.json` の name は `admin`)。

## 木

役割は 1 行。テストは隣に 1 行。import は `@/` (= `src/`) の絶対パス。

```text
templates/frontend/admin/                           = apps/<app>/frontend/admin/
  package.json                                      name は admin。依存 (react・vite・Polaris の型) と scripts
  package-lock.json                                 依存の固定。`npm ci` で再現する (検査もこれで入れる)
  tsconfig.json                                     strict・noUncheckedIndexedAccess・paths `@/*`
  vite.config.ts                                    alias `@/`・dist/app.js と app.css の固定名 (他の資産は assets/[name]-[hash])・vitest (jsdom)
  .dependency-cruiser.cjs                           規則 12 本の正本
  src/
    main.tsx                                        描画の入口 (起動の 1 行)
    app/                                            feature をまたぐ合成はここだけ
      routes.ts                                     経路の正本。`routes` (空の表 + 登録の目印 `@igeta:register-import`・`-route`) と `matchRoute(routes, pathname)`
      routes.test.ts                                一致・不一致・表が空でも落ちない (表を渡して確かめる)
      App.tsx                                       Provider を積み経路を描く。`routes` を props で受ける (既定は routes.ts の表)
      App.test.tsx                                  表を渡して経路ごとの画面・不明は not-found
      providers.tsx                                 ApiProvider と App Bridge を積む
      providers.test.tsx                            子に api が届く
      not-found.tsx                                 見つかりません画面
      not-found.test.tsx                            入口へ戻る案内
    features/
      __feature__/                                  1 単位
        index.ts                                    公開面。Screen と、他 feature に見せる hook・部品だけ
        presentation/
          screen/
            __Feature__Screen.tsx                   画面。3 状態と部品の組み立てだけ
            __Feature__Screen.test.tsx              空・読み込み中・エラー・表示・操作
          components/
            __Feature__Row.tsx                      一覧の 1 行
            __Feature__Row.test.tsx                 文字として出す・操作を返す
            __Feature__Form.tsx                     登録の入力欄。検証は domain を呼ぶ
            __Feature__Form.test.tsx                誤りを出す・送らない
            __Feature__Toolbar.tsx                  追加・絞り込み
            __Feature__Toolbar.test.tsx             操作を呼び出し元へ返す
        application/
          use-__feature__.ts                        取得と状態 (読み込み・再取得)。endpoint → mapper
          use-__feature__.test.tsx                  状態の移り変わり
          use-__feature__-mutation.ts               書き込みの流れ (確認 → 送信中 → 二重防止 → 通知 → 再取得)
          use-__feature__-mutation.test.tsx         やめる・二重クリック・失敗で入力が残る
          messages.ts                               この feature の文言 (code → 文)
          messages.test.ts                          全 code を網羅
        domain/
          model.ts                      画面側の型と絞り込み
          model.test.ts                 絞り込みの表
          validation.ts                 入力の検証 (項目ごとの規則、誤りの集約)
          validation.test.ts            境界値の表
          rules.ts                      判断だけの純関数 (閉じる確認が要る条件など)
          rules.test.ts                 条件ごとの真偽
        infrastructure/
          endpoint.ts                   API の呼び出し。パスとメソッドはここだけ
          endpoint.test.ts              パス・メソッド・本文
          dto.ts                        要求・応答の型 (API 仕様の写し。型だけ)
          mapper.ts                     dto ⇄ model の変換
          mapper.test.ts                欠け・未知の値・往復
        test-support/
          __feature__.fixtures.ts                   試験用の値 (dtoFixture・modelFixture)。試験だけが import する
    shared/                                         共通機能と部品の既定の置き場。feature と app を知らない
      presentation/
        bind-field.ts                               Polaris 入力欄の確定の購読 (bindField と、購読を 1 回だけにする useBindField)
        bind-field.test.ts                          確定で 1 回だけ呼ぶ
        ui/                                         意味を知らない部品
          state/LoadingView.tsx                           読み込み中
          state/LoadingView.test.tsx                      文言を出す
          state/ErrorView.tsx                             エラーとやり直し
          state/ErrorView.test.tsx                        再試行を呼び出し元へ返す
          state/EmptyState.tsx                            空の状態
          state/EmptyState.test.tsx                       見出しと操作
          control/ConfirmDialog.tsx                         確認ダイアログ
          control/ConfirmDialog.test.tsx                    確定は true・やめる・外側・閉じるは false
          control/DateField.tsx                             日付欄
          control/DateField.test.tsx                        値と onChange
          state/FormErrorBanner.tsx                       入力の誤りを送らずに止めた知らせ
          state/FormErrorBanner.test.tsx                  項目を並べる
          state/SaveErrorBanner.tsx                       保存失敗とやり直し
          state/SaveErrorBanner.test.tsx                  details と再試行
          label/StatusBadge.tsx                           状態の印 (語は引数)
          label/StatusBadge.test.tsx                      tone ごとの出し方
          label/CountLabel.tsx                            件数の表示 (打ち切られたときだけ `n+`)
          label/CountLabel.test.tsx                       0・100 件で打ち切りなし/あり・単位
      application/
        hooks/api.tsx                                 ApiProvider と useApi
        hooks/api.test.tsx                            Provider の外では投げる
        hooks/resource.ts                             取得の状態 (読み込み中・成功・失敗・再取得)
        hooks/resource.test.ts                        重なった要求は最後だけ使う
        hooks/mutation-flow.ts                        書き込みの共通の流れ (確認 → 送信中 → 二重送信の防止 → 通知 → 再取得)。feature は手順を渡す
        hooks/mutation-flow.test.tsx                  やめる・busy・失敗は再取得しない・dismiss
        hooks/navigate.ts                             画面内の移動の hook
        hooks/navigate.test.ts                        履歴と search の引き継ぎ
      domain/                                       値と形だけ
        api.ts                                      Api・ApiResult・ApiError の型 (型だけ)
        api-error.ts                                ApiError の読み取り (validationFields = VALIDATION_FAILED の項目名)
        api-error.test.ts                           文字だけ・無ければ空
        date.ts                                     Asia/Tokyo の今日・加減・差
        date.test.ts                                UTC 15:00 前後の境界
        field-parse.ts                              数・文字の parse と誤りの集約
        field-parse.test.ts                         空欄・小数・範囲外
        url.ts                                      search を引き継いで path を組む (埋め込みアプリの host 引数のように全画面で保つ検索部)
        url.test.ts                                 引き継ぎと上書き
      infrastructure/
        create-api.ts                               createApi。Bearer・401 は 1 回だけ再送・失敗は結果の形で返す
        create-api.test.ts                          再送・通信失敗・query
        app-bridge.ts                               idToken など App Bridge の口
        app-bridge.test.ts                          gid → 数字の変換
        session.ts                                  localStorage (使えなくても黙って続ける)
        session.test.ts                             保存不可でも投げない
        navigate.ts                                 history の置き換え (search を引き継ぐ)
        navigate.test.ts                            修飾キー・履歴
      test-support/
        setup.ts                                    vitest の初期設定 (Polaris の要素を素の要素にする)
        fake-api.ts                                 偽の API。呼ばれた要求を calls に残す
        fake-app-bridge.ts                          App Bridge の偽物
        polaris.ts                                  heading 属性の見出しの探し方 (findBanner)
```

## 層の決まり (`.dependency-cruiser.cjs` が落とす 12 本)

1〜5 は層の名前で `features/*` と `shared` に一括で掛ける。

1. `domain-stays-inside-domain` — domain は domain の外へ出ない
2. `infrastructure-does-not-look-up` — infrastructure は application・presentation を見ない
3. `application-does-not-look-at-presentation` — application は presentation を見ない
4. `presentation-does-not-look-at-infrastructure` — presentation は infrastructure を見ない
5. `domain-is-framework-free` — domain は React・npm・shared/infrastructure を使わない
6. `components-do-not-import-screen` — components は screen を見ない
7. `shared-ui-depends-on-domain-and-ui-only` — `shared/presentation/ui` は shared/domain と shared/presentation だけ (application・infrastructure は見ない)
8. `other-features-through-index-only` — 他の feature へは `index.ts` だけ (app も同じ)
9. `shared-is-a-leaf` — shared は feature・app を知らない
10. `app-is-read-by-main-only` — app を読むのは `main.tsx` だけ
11. `production-does-not-import-test-support` — 本番は `shared/test-support` も `features/<x>/test-support` も使わない
12. `no-circular` — 循環なし

backend と違い、application → infrastructure と presentation → domain は許す (差し替えの継ぎ目は `Api` 1 つで、domain は型と純関数だから)。dto ⇄ model の変換は mapper (infrastructure) で、domain は dto を知らない。

feature 間は 3 経路。(1) 経路と合成は `app/` が組む。(2) 複数画面に埋める部品と読む口は相手の `index.ts` だけ。(3) 値・形・文言は `shared/`。業務の語を知らない物は、使い手が 1 つでも `shared/` が既定。

## 見本と文言

- 見本の資源は backend と同じ `{id, name, status: 'open'|'closed'}`。操作は list・create・close の 3 本 (endpoint・mutation・Row・Toolbar・Form が対応する)
- 複数 feature で使う文言は雛形に置かない。要る時に `shared/application/messages.ts` を作る

## 書き方の決まり

- 見た目は Polaris の web components (`s-*`) だけ。import しない (型は `@shopify/polaris-types`)。値は文字として出し、HTML として差し込まない
- 画面は空・読み込み中・エラー (やり直し付き) の 3 状態を必ず出す。アイコンは Phosphor、絵文字は使わない
- API のパスはその feature の `*.endpoint.ts` にだけ書く。読み込みと保存は application の hook に書き、見た目に書かない
- React の `onChange` は 1 回の確定で 2 回呼ばれる。副作用を置かず、確定の購読は `shared/presentation/bind-field.ts` の `useBindField` を使う
- TypeScript は strict・`noUncheckedIndexedAccess`・`any` 禁止。npm の規則は `(^|/)node_modules/<名前>` から書く
- Node は 22 か 24 (jsdom の engine。25 は組み込みの localStorage が jsdom を覆い session.test が落ちる、実測)

## E2E が頼る DOM の目印

E2E (Playwright など) の入力・押下は次の形に頼る。部品を差し替えるときはここを保つ。

| 目印 | 確かめるテスト |
|---|---|
| `s-text-field[label^=…]`・`s-number-field[label^=…]`・`s-date-field[label^=…]`。`label` は**属性**。絞り込み欄の label は入力欄の label と先頭が重ならない語にする | Form・Toolbar・`DateField` のテスト |
| `maxlength`・`required`・`readonly` も属性 | Form・Screen のテスト |
| `value` は**プロパティ** (属性に出ない) | `bind-field.test.ts`・Form のテスト |
| `s-button` は `onClick` で 1 回 | Row・Toolbar・`ConfirmDialog` のテスト |
| 確認ダイアログは `s-modal[heading=…]`。確定・やめる・外側・閉じるのどれでも結果は 1 回 | `ConfirmDialog.test.tsx` |
| host は `display:contents`。操作は内側の `input`/`select`。`s-select` は host の `.value`、`s-checkbox` は `.checked`、`s-choice-list` は `.values` | 雛形のテスト対象外 (jsdom は Polaris を読まない。使う部品が今の雛形に無い。使うとき実ブラウザで実測する) |
| バナーの見出しは `heading` 属性で、文字として描かれない | `findBanner` (`shared/test-support/polaris.ts`) |

React の `onChange` は 1 回の確定で 2 回呼ばれる。副作用を置かず、確定の購読は `shared/presentation/bind-field.ts` の `bindField` を使う。

## テスト

| 書くもの | テスト | 確かめ方 |
|---|---|---|
| 画面 | `*Screen.test.tsx` | Testing Library。3 状態・表示・操作 |
| components・`shared/presentation/ui` | 隣の `*.test.tsx` | 受け取った値の出し方と、操作を呼び出し元へ返すこと |
| hook | 隣の `*.test.ts(x)` | `renderHook`。状態の移り変わりと API の呼び方。偽の API は `shared/test-support/fake-api.ts`。feature の試験の値は `test-support/__feature__.fixtures.ts` |
| endpoint・mapper | 隣の `*.test.ts` | パス・メソッド・本文 / 欠け・未知の値 |
| domain | 隣の `*.test.ts` | 偽物なしで表を直接 |

Polaris の部品はテストでは読み込まれず、ただの要素になる。見出し (heading 属性) は文字として描かれないので `findBanner` で探す。画面の流れ全体は E2E で確かめる。
