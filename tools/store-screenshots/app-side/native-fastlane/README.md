# app-side/native-fastlane — ネイティブ iOS 用の撮影アダプタ

ネイティブ Swift/SwiftUI・UIKit アプリ向け。元記事の手法そのまま:
XCUITest に起動引数を渡し、アプリ側が DEBUG ビルドで状態注入する。撮影は fastlane snapshot。

## コピー先

| コピー元 | コピー先 |
| --- | --- |
| `Snapfile` | `<repo>/fastlane/Snapfile` |
| `screenshots_lane.rb` | `<repo>/fastlane/` 内の `Fastfile` に貼る |
| `ScreenshotsUITests.swift` | `<app>UITests/`（UI test target） |

## アプリ側の契約

アプリが DEBUG ビルドで守るべきこと（実装はアプリ依存）:

1. `ProcessInfo.processInfo.arguments`（または `UserDefaults.standard` の `-screenshot`）からシナリオ名を読む。
2. シナリオ名に対応する画面へ直行する（UI 遷移は辿らない）。認証・ネットワークは `URLProtocol` や DI 差し替えでモック化するのが簡単。
3. 各画面の「この文字列が見えたら撮影OK」の目印を、`accessibilityIdentifier` または表示文字列として出す。UITest はそれを `waitForExistence` してから `snapshot()` する。

`ScreenshotsUITests.swift` の `SCENARIOS` と `scripts/locales.mjs` 側の `SLIDES[].anchor` を対応させる。

## 撮影

```sh
fastlane screenshots      # scheme・デバイスは Snapfile / lane を参照
```

撮った raw PNG は `store/screenshots_raw/iphone/<locale>/NN.png` の形でこのパイプラインへ入れる
（`fastlane screenshot` の出力から `make screenshots-sync` が読める場所に移す）。
