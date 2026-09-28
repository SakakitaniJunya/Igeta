# WORKFLOW — iOS アプリの開発手順

設計書を先に書き、機能単位で TDD で実装し、シミュレータで見た目を検証してから PR を出す。

## 1. 設計書を先に書く

Igeta の `templates/docs/` にある設計書テンプレを自分のリポジトリの `docs/` へコピーして使う (コピー方法・読む順は `templates/README.md` と `templates/docs/` 内の各 README を参照)。

基本設計はこの順で書く:

1. `design/basic/01-function-list.md` — 機能一覧。ここで挙げた機能 (FN-*) が以降の文書と実装の単位になる
2. `design/basic/screens/` — 画面設計 (`__screen-group__.md` を画面群ごとに採番)
3. `design/basic/tables/` — データ定義。SwiftData の `@Model` はここの定義に合わせる
4. `design/basic/flows/` — 業務フロー。振る舞いのテストはここを根拠に書く

実装中に判断を変えたらコードではなく設計書を先に直す。

## 2. 機能単位で TDD

設計書の機能 (FN-*) ごとに、赤 → 緑 → リファクタを回す:

1. 機能の振る舞いを決める純粋なロジック (入力 → 出力) を View / Model から切り出せる形で設計する。`__NAME__Tests/` のコメントに抽出系ロジックのテスト例がある
2. 失敗するテストを先に書く (赤)
3. テストが通る最小の実装を書く (緑)
4. テストを守りながら整理する (リファクタ)

UI に依存しないロジックは可能な限り `@testable import` でユニットテストする。SwiftData のモデルは `ModelContainer(for:inMemory:)` を使ったインメモリコンテナでテストできる。

## 3. UI はシミュレータで検証する

見た目の確認はシミュレータのスクリーンショットで行う:

```sh
# 起動して画面を撮る
xcodebuild -scheme __NAME__ -destination 'platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO
xcrun simctl boot <UDID> 2>/dev/null || true
xcrun simctl install <UDID> <build products>/__NAME__.app
xcrun simctl launch <UDID> __BUNDLE_PREFIX__.app
xcrun simctl io <UDID> screenshot screenshot.png
```

`<UDID>` は `xcrun simctl list devices available` で調べる。画面設計 (`docs/design/basic/screens/`) と突き合わせて、設計どおりの表示・遷移になっているか確認する。画面を変えたらスクショを撮り直して差分を目視確認する。

## 4. PR を出す前に

```sh
xcodebuild -scheme __NAME__ -destination 'platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO
xcodebuild -scheme __NAME__ -destination 'platform=iOS Simulator' test CODE_SIGNING_ALLOWED=NO
```

- build / test が両方通っていること
- 実装と設計書 (機能一覧・画面・フロー) が食い違っていないこと
- `xcodegen generate` し直しても差分が出ないこと (project.yml と .xcodeproj の整合)
