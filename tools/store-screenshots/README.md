# store-screenshots — ストア提出用スクリーンショット自動生成の型

iOS / Android アプリのストア提出用スクリーンショットを「**状態を注入して実機で撮る → ブラウザで額装する**」の2工程に分けて自動化する雛形。
元ネタ: [XCUITest × fastlane snapshot × Playwright での App Store スクショ自動化](https://zenn.dev/yamshta/articles/20260114-ios-appstore-screenshot-automation)。

## なぜ分けるか

- **撮影**はデバイス/OS 依存・遅い・壊れやすい。**額装**（見出し・背景・端末フレーム）はブラウザでやれば速いし CSS で調整できる。
- raw → 額装入力 → 合成 の **一方向データフロー**。誰がいつ撮ったかに関わらず同じ出力が出る。
- 文言だけ直したいときは撮影なしで `make screenshots-regen`。

## 構成とコピー先

このフォルダの中身は**利用リポジトリのルート構成と同じ**。対応表の通りにコピーする。

| ここ | コピー先 | 中身 |
| --- | --- | --- |
| `editor/` | `store-screenshots/` | 額装エディタ（依存ゼロの静的レンダラ + export/check） |
| `scripts/` | `scripts/` | ロケール対応表・sync・撮影シェル |
| `app-side/expo-maestro/` | アプリ側（Expo / RN） | 起動引数注入 + Maestro フロー |
| `app-side/native-fastlane/` | アプリ側（ネイティブ iOS） | XCUITest + fastlane snapshot |
| `Makefile.screenshots` | `Makefile` | `include` するかターゲットを貼る |

アプリ側は1つだけ選ぶ。Expo/RN なら `expo-maestro`、ネイティブ iOS なら `native-fastlane`。
`app-side/*/README.md` にアプリへの組み込み手順がある。

## 導入手順

1. `editor/` → `store-screenshots/`、`scripts/` → `scripts/`、`Makefile.screenshots` をリポジトリへコピー。
2. アプリ側アダプタを選んで `app-side/<方式>/` の README 通りに組み込む。
3. `scripts/locales.mjs` の `CAPTURE_TARGETS`（appId・シミュレータ機種）を自分のアプリに合わせる。
4. `store-screenshots/src/defaults.mjs` の `SLIDES` を編集（キャプチャ対象・見出し・背景）。
5. `.gitignore` に生成物を足す:

   ```text
   store/screenshots_raw/
   store/screenshots/
   store-screenshots/screenshots/
   ```

6. `make screenshots-editor` でプレビュー → `make screenshots` で撮影→合成 → `make screenshots-check` で崩れ検査。

## 設計上の約束（元記事由来）

- UI 遷移は辿らない。起動引数 `screenshot=<name>` で状態を注入し、DEBUG 相当ビルドでのみ有効。
- モックはアプリの画面コードではなく通信アダプタ層に入れる。
- 撮影は「その画面に必ず出るアンカー文字列」の表示を待ってから。白画面を撮り逃さない。
- 崩れ検査（`check.mjs`）は DOM を**実測**する。検査側でレイアウトを再計算しない。
- ロケールコードの対応表（editor/snapshot/asc の3系統）は `scripts/locales.mjs` の1か所に集約。

## 依存

- Node.js / Playwright（額装・検査）
- 撮影方式による: Maestro または fastlane + Xcode
