# frontend — React + Vite + TypeScript の管理画面の雛形 (Vertical Slice Architecture)

Shopify の埋め込みアプリの管理画面を想定する。見た目は Polaris の web components (`s-*`、Shopify の CDN から読む)、トークンは App Bridge。1 つの機能 = 1 つの縦割り (`features/<機能>/`) で、その機能の見た目・状態と操作・API の呼び出し・部品・テストを、全部そのフォルダに置く。機能をまたいで使うものだけを `common/` に出す。

使い方: 置きたい場所へフォルダごとコピーし、ファイル名と中身のプレースホルダを置き換える。例として入れた中身 (一覧と「停止・再開」) は、作るものに合わせて書き換える。

## 雛形

| 雛形 | コピー先 | いつ |
|---|---|---|
| `base/` | `apps/<アプリ>/frontend/admin/` | 最初に 1 回。API の呼び出しの土台・読み込みの状態・共通の見た目・テストの道具・tsconfig・vite・dependency-cruiser・package.json |
| `feature/__feature__/` | `apps/<アプリ>/frontend/admin/src/features/<機能>/` | 機能を足すたび。縦割り一式 |
| `common/ui/` | `apps/<アプリ>/frontend/admin/src/common/ui/` | 2 つ以上の機能で使う見た目の部品を足すとき |

起動 (`src/main.tsx`) と振り分け (`src/app/`) はアプリごとに書く。`createApi(() => shopify.idToken())` を `ApiProvider` で渡し、URL から機能の画面を選ぶ。HTML はサーバが返す (vite は `dist/app.js`・`dist/app.css` を決まった名前で出す)。

```text
frontend/admin/src/
  app/                 起動・どの URL でどの機能を出すか (機能を並べるだけ)
  features/<機能>/
    <機能>Page.tsx       見た目
    use-<機能>.ts        状態と操作
    <機能>.api.ts        この機能の API の呼び出しと型
    components/         この機能の中だけで使う部品
  common/
    lib/                API の呼び出しの土台 (api)・読み込みの状態 (use-resource)
    ui/                 共通の見た目 (LoadingView・ErrorView・EmptyState)
  test-support/         偽の API (fake-api)・Polaris の見出しの探し方 (polaris)
```

## プレースホルダ

| 書き方 | 形 | 例 |
|---|---|---|
| `__feature__` / `__Feature__` | ケバブ / パスカル | `locations` / `Locations` (API のパスにも使う) |
| `__Component__` | パスカル | `StatusBadge` |
| `__app__` | ケバブ | パッケージ名の頭 |

## 縦割りの決まり (`base/.dependency-cruiser.cjs` が落とす)

- 機能は別の機能を import しない。共通にしたいものは `common/` に出す
- `common/` は機能も `app/` も知らない。機能は `app/` を知らない
- 本番のコードは `test-support/` を使わない

## 書き方の決まり

- 見た目は Polaris の web components (`s-*`) だけ。import しない (型は `@shopify/polaris-types`)
- 画面は読み込み中・エラー (やり直し付き)・空の 3 つの状態を必ず出す。値は文字として出し、HTML として差し込まない
- API のパスはその機能の `<機能>.api.ts` にだけ書く。読み込みと保存はフック (`use-<機能>.ts`) に書き、見た目に書かない

## テスト — 雛形のファイルには、対になるテストが必ずある

| 書くもの | テスト | 確かめ方 |
|---|---|---|
| 機能の画面 | `<機能>Page.test.tsx` | Testing Library。3 つの状態・表示・操作 |
| フック | `use-<機能>.test.tsx` | `renderHook`。状態の移り変わりと API の呼び方 |
| API の呼び出し | `<機能>.api.test.ts` | パス・メソッド・本文 |
| 部品 (機能の中・共通) | `<部品>.test.tsx` | 受け取った値の出し方と、操作を呼び出し元へ返すこと |

Polaris の部品はテストでは読み込まれない (ただの要素になる)。見出し (heading 属性) は文字として描かれないので `test-support/polaris` の `findBanner` で探す。画面の流れ全体は E2E で確かめる。
