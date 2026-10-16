# backend — Hono + Firestore のモジュラーモノリスの雛形

HTTP の入口は Hono、データは Firestore (`@google-cloud/firestore`)。コンテキストごとに `src/modules/<context>/` を 4 層 (domain・application・infrastructure・presentation) で切る。

使い方: 置きたい場所へフォルダごとコピーし、ファイル名と中身のプレースホルダを置き換える。例として入れた中身 (「閉じる」操作・名称と状態の列) は、作るものに合わせて書き換える。

## 雛形

| 雛形 | コピー先 | いつ |
|---|---|---|
| `base/` | `apps/<アプリ>/backend/` | 最初に 1 回。共有カーネル (`Result`・`AppError`・`TransactionScope`・doc ID の検査)・応答の形・Hono への変換・本文の読み取り・Firestore の生成・tsconfig・vitest・dependency-cruiser・package.json |
| `module/__context__/` | `apps/<アプリ>/backend/src/modules/<context>/` | コンテキストを足すたび。4 層と公開面 (`index.ts`) とテスト |
| `presentation/__entry__/` | `apps/<アプリ>/backend/src/presentation/<入口>/` | 入口を足すたび。Hono のルート・検証のミドルウェア・テスト |

エントリ (`src/index.ts`) はアプリごとに書く。`new Hono()` に `app.route('<前置き>', create<入口>Routes(deps))` で入口を付け、`@hono/node-server` の `serve` で立てる。

## プレースホルダ

| 書き方 | 形 | 例 |
|---|---|---|
| `__context__` / `__Context__` / `__contextVar__` | ケバブ / パスカル / キャメル | `stock-item` / `StockItem` / `stockItem` |
| `__aggregate__` / `__Aggregate__` | ケバブ / パスカル | `location` / `Location` |
| `__entry__` / `__Entry__` | ケバブ / パスカル | `proxy` / `Proxy` |
| `__app__` | ケバブ | パッケージ名の頭 |
| `__emulatorProject__` | 文字列 | Firestore エミュレータのプロジェクト ID (`demo-` で始める) |

ケバブの形は、ファイル名・URL・文字列にだけ使う。変数名にはパスカルかキャメルを使う。

## 層の決まり (`base/.dependency-cruiser.cjs` が落とす)

- `domain/` は他の層も npm も知らない。テストは `__tests__/` に置く
- `application/` は domain と `shared/kernel` だけ。失敗は投げずに `Result` で返す
- `@google-cloud/firestore` は `infrastructure/`・`platform/`・組み立ての場所 (`modules/<x>/index.ts`) だけ
- モジュールの `presentation/` (コントローラ) は Hono を知らない。値を受け取り `HttpResponse` を返す
- Hono は `src/presentation/` と `src/index.ts` だけ。platform の検証関数は index.ts が包んでルートに渡す
- 他のコンテキストは `modules/<x>/index.ts` だけを通して使う

npm のパッケージは `node_modules/<名前>/...` に解決されるので、パッケージのルールは `(^|/)node_modules/` から書く (`^hono` と書くと一致せず、ルールが効かない)。

## テスト — 雛形のファイルには、対になるテストが必ずある

| 書くもの | テスト | 確かめ方 |
|---|---|---|
| 集約・値オブジェクト・ドメインエラー | `__tests__/<集約>.spec.ts` | 偽物なしで直接 |
| ユースケース | `application/<操作>.usecase.spec.ts` | port をメモリ上の偽物にする |
| リポジトリ (Firestore) | `__tests__/<集約>.emulator.spec.ts` | Firestore エミュレータ (`test:emulator` のときだけ) |
| 公開面 (index.ts の組み立て) | `__tests__/<context>-module.emulator.spec.ts` | 本物の部品を組んでエミュレータ越しに |
| コントローラ | `presentation/<集約>.controller.spec.ts` | ユースケースを偽物にし、状態と本文の対応だけ |
| Hono のルート | `<入口>.routes.spec.ts` | `app.request()`。モジュールの公開面は偽物 |
| 検証ミドルウェア | `verify-<入口>.middleware.spec.ts` | 小さな Hono のアプリに掛ける |

port (型だけのファイル) にはテストを書かない。
