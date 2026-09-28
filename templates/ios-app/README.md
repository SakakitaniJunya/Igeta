# ios-app — iOS アプリ雛形 (xcodegen + SwiftUI + SwiftData)

xcodegen で Xcode プロジェクトを生成する iOS アプリの雛形。SwiftUI + SwiftData、Share Extension、ユニットテスト (`bundle.unit-test`) 込み。設計書を先に書いて TDD で進める開発フローは `WORKFLOW.md` を参照。

## 前提ツール

- Xcode (App Store / 開発者サイトからインストール、初回は `xcodebuild -license accept` と追加コンポーネントのインストールが必要)
- [xcodegen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`

## 構成

| パス | 中身 |
| --- | --- |
| `project.yml` | xcodegen 定義。アプリ本体 + Share Extension + テストの 3 ターゲット |
| `__NAME__/` | アプリ本体。`App.swift` (@main + SwiftData) / `Models.swift` (@Model 例) / `RootView.swift` (TabView) |
| `__NAME__/Info.plist` | `CFBundleDisplayName`=`__NAME__`、開発言語 ja、空の `UILaunchScreen` |
| `__NAME__/__NAME__.entitlements` | App Group `group.__BUNDLE_PREFIX__.app` (ShareExtension と共有) |
| `__NAME__/Assets.xcassets/` | 空の AppIcon セット |
| `ShareExtension/` | 共有シートから URL を受け取り App Group 経由で本体へ渡す最小実装 |
| `__NAME__Tests/` | XCTest のサンプル |
| `WORKFLOW.md` | 設計書 → TDD → simctl 検証 → PR 前チェックの開発手順 |

## 使い方

1. このフォルダを自分のリポジトリへコピーする:

   ```sh
   cp -R templates/ios-app <your-app-dir>
   cd <your-app-dir>
   ```

2. プレースホルダを置換する。`__NAME__` はアプリ名 (= プロジェクト名・ターゲット名・モジュール名。英数字のみ)、`__BUNDLE_PREFIX__` は Bundle ID の接頭辞:

   ```sh
   export NAME=SampleApp            # アプリ名
   export PREFIX=com.example        # Bundle ID 接頭辞

   # ディレクトリ名・ファイル名の __NAME__ を置換
   find . -depth -name '*__NAME__*' | while read -r f; do
     mv "$f" "$(dirname "$f")/$(basename "$f" | sed "s/__NAME__/$NAME/g")"
   done

   # ファイル中身の __NAME__ / __BUNDLE_PREFIX__ を置換
   grep -rl '__NAME__' . | xargs sed -i '' "s/__NAME__/$NAME/g"
   grep -rl '__BUNDLE_PREFIX__' . | xargs sed -i '' "s/__BUNDLE_PREFIX__/$PREFIX/g"
   ```

3. Xcode プロジェクトを生成してビルド・テストする:

   ```sh
   xcodegen generate
   xcodebuild -scheme "$NAME" -destination 'platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO
   xcodebuild -scheme "$NAME" -destination 'platform=iOS Simulator' test CODE_SIGNING_ALLOWED=NO
   ```

   `-destination` は `xcrun simctl list devices available` で出る機種名か UDID を指定する。同名のシミュレータが複数ある環境では UDID で指定する。

4. `WORKFLOW.md` の手順で開発を進める。

## 配布 (実機・Archive) するときの注意

- App Group (`group.__BUNDLE_PREFIX__.app`) はアプリ・Share Extension の両方の entitlements に書いてある。Bundle ID を変えたら App Group ID も揃えて変え、Apple Developer 側に App Group を登録する。
- `project.yml` の `CODE_SIGN_ENTITLEMENTS`・プロビジョニングは環境に合わせて設定する。
- AppIcon は空のままなので、ストア提出前に 1024x1024 のアイコンを `Assets.xcassets/AppIcon.appiconset` に入れる。
