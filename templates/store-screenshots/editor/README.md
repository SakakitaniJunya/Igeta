# store-screenshots

App Store / Google Play 提出用スクリーンショットの生成パイプライン。

## 仕組み

```text
シミュレータ/エミュレータ                     ブラウザ (Playwright)
┌─────────────────────┐   raw PNG   ┌─────────────────────────┐
│ 起動引数で状態注入     │ ──────────▶ │ render.html 額装          │  composed PNG
│ screenshot=<scenario>│  一方通行    │ + clip 撮影               │ ──────▶ ストア
└─────────────────────┘             └─────────────────────────┘
```

| もの | 場所 |
| --- | --- |
| 撮影シナリオ（状態注入） | アプリ側（`app-side/` 参照） |
| ロケール/デバイス対応表 | `scripts/locales.mjs` |
| 文言・レイアウト | `store-screenshots/src/defaults.mjs` |
| raw（撮ったまま） | `store/screenshots_raw/<device>/<locale>/NN.png` |
| エディタの入力 | `store-screenshots/screenshots/<store>/<device>/<locale>/NN.png` |
| composed（公開するもの） | `store/screenshots/<asc-locale>/NN.png` |

raw と composed は別ディレクトリ。入力は一方通行（sync は raw → 入力のみ）。

## 操作

```sh
make screenshots-editor    # プレビュー用サーバ (localhost:3000/store-screenshots/index.html)
make screenshots           # 撮影 → 配布 → 合成
make screenshots-check     # 見出し・余白の崩れを全ロケール×全スライドで検査
make screenshots-regen     # 文言だけ直したとき: 撮影なしで sync → export → check
```

`screenshot=<scenario>` 起動引数でアプリ内部状態を注入する。UI を辿って目的画面へ進めない。
撮影はアンカー文字列の表示を確認してから行う（白画面の取り違えを防ぐ）。

### 文言だけ変えたい

`src/defaults.mjs` を編集して `make screenshots-regen`。シミュレータ/エミュレータは不要。

## 依存

- Node.js（スクリプト群）
- Playwright（`npx playwright install chromium` が必要な場合あり）
- 撮影ツール（アプリ側の方式による）: Maestro または fastlane
- Xcode（iOS 撮影時のみ）
