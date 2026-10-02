# templates — 雛形置き場 (コピー元)

ここにあるファイルは**そのまま使わず、自分のリポジトリへコピーして使う**。`__name__` はプレースホルダ。ファイル名先頭の `NN-` は同じフォルダ内で読む順。固定名の雛形はそのまま、`__name__` は自分で採番する (`flows/01-<業務名>.md`)。

| フォルダ | コピー先 | コピーの仕方 |
|---|---|---|
| `docs/` | `your-repo/docs/` | 手でコピー。**フォルダ構成がコピー先と同じ**なので、置きたい場所と同じパスの雛形を選び、`__context__` (まとまり)・`__year__` (年)・`__deliverable__` (提出物) を実際の名前に替える (`templates/docs/person/design/__context__/flows/__flow__.md` → `docs/person/design/reservation/flows/01-<業務名>.md`) |
| `api-module/` | `your-repo/apps/api/` | `npm run scaffold:module -- --context <name> --aggregate <Name>` |
| `api-shared-kernel/` | `your-repo/apps/api/` | 初回のみ `--include-kernel` を付ける |
| `web-feature/` | `your-repo/apps/web/` | `npm run scaffold:module -- --kind web --feature <name>` |
| `store-screenshots/` | `your-repo/` ルート | 手でコピー。フォルダ構成がコピー先と同じ (`store-screenshots/`・`scripts/`・`Makefile.screenshots`・`app-side/<方式>/`)。iOS/Android ストア提出用スクショの撮影→額装パイプライン |
| `ios-app/` | `your-repo/` のアプリ用ディレクトリ | 手でコピー。`__NAME__` / `__BUNDLE_PREFIX__` を置換して `xcodegen generate` (手順は `ios-app/README.md`)。xcodegen + SwiftUI + SwiftData + Share Extension + XCTest の雛形 |

`docs/ai/handbook/how-to/` の `01-document-taxonomy.md` (文書体系)・`03-human-review.md` (人間レビュー層)・`04-provenance-workflow.md` (由来の手順) は **Igeta の版ごとに決まる手引きで、利用 repo にはコピーしない**。`AGENTS.md` と `docs/README.md` から、インストールした版のもの (`node_modules/igeta/templates/docs/ai/handbook/how-to/`) を指す。`02-implementation-order.md` (実装順序) は、着手順をプロジェクトが埋める文書なので、利用 repo の `docs/ai/handbook/how-to/` にコピーして使う。Igeta ルートの `docs/` は雛形ではなく、Igeta 自身の背景。
