# templates — 雛形置き場 (コピー元)

ここにあるファイルは**そのまま使わず、自分のリポジトリへコピーして使う**。`__name__` はプレースホルダ。ファイル名先頭の `NN-` は同じフォルダ内で読む順。固定名の雛形はそのまま、`__name__` は自分で採番する (`flows/01-<業務名>.md`)。

| フォルダ | コピー先 | コピーの仕方 |
|---|---|---|
| `docs/` | `your-repo/docs/` | 手でコピー。**フォルダ構成がコピー先と同じ**なので、置きたい場所と同じパスの雛形を選び、`__context__` (まとまり)・`__year__` (年)・`__deliverable__` (提出物) を実際の名前に替える (`templates/docs/person/design/__context__/flows/__flow__.md` → `docs/person/design/reservation/flows/01-<業務名>.md`) |
| `backend/<変種>/` | `your-repo/apps/<アプリ>/backend/` | 土台は手でコピー、1 単位は `igeta expand`。変種は `hono/`・`nestjs/`・`rust/` の 3 つ (Firestore の 4 層モジュラーモノリス)。**鏡**: `templates/backend/<変種>/` の中の path = `apps/<アプリ>/backend/` の中の path。土台 (印の無いファイル) は最初に 1 回、1 単位 (印の付いた `src/entries/__entry__/`・`src/modules/__context__/`) は足すたび。手順は `backend/README.md` から変種の README へ |
| `frontend/` | `your-repo/apps/<アプリ>/frontend/admin/` | 土台は手でコピー、1 単位は `igeta expand`。**鏡**: `templates/frontend/admin/` の中の path = `apps/<アプリ>/frontend/admin/` の中の path。React + Vite + TypeScript の管理画面 (4 層)。土台は最初に 1 回、1 単位 (印の付いた `src/features/__feature__/`) は足すたび。手順は `frontend/README.md` |
| `mobile/ios/` | `your-repo/apps/<アプリ>/mobile/ios/` | 手でコピー。`__NAME__` / `__BUNDLE_PREFIX__` を置換して `xcodegen generate` (手順は `mobile/ios/README.md`)。xcodegen + SwiftUI + SwiftData + Share Extension + XCTest の雛形 |

`backend/`・`frontend/` は 1 単位を `expand` で展開する。例: `igeta expand templates/backend/hono/src/modules/__context__ --app shop --context stock-item --aggregate location` は `apps/shop/backend/src/modules/stock-item/` を作る。雛形が壊れていないかは `igeta check-templates` が展開・型・テスト・build まで通して確かめる。

`backend/`・`frontend/` の 1 単位は全部で 3 つ (`src/entries/__entry__/`・`src/modules/__context__/`・`src/features/__feature__/`)。Igeta には土台も置く (実アプリが無く、雛形だけで組み立てて検査するため)。**利用 repo 側の `templates/` に置くのは 1 単位 3 つだけでよい** (土台はそのアプリ自身)。

`docs/ai/handbook/how-to/` の `01-document-taxonomy.md` (文書体系)・`03-human-review.md` (人間レビュー層)・`04-provenance-workflow.md` (由来の手順) は **Igeta の版ごとに決まる手引きで、利用 repo にはコピーしない**。`AGENTS.md` と `docs/README.md` から、インストールした版のもの (`node_modules/igeta/templates/docs/ai/handbook/how-to/`) を指す。`02-implementation-order.md` (実装順序) は、着手順をプロジェクトが埋める文書なので、利用 repo の `docs/ai/handbook/how-to/` にコピーして使う。Igeta ルートの `docs/` は雛形ではなく、Igeta 自身の背景。ストア提出用スクショの撮影→額装パイプラインは雛形でなく道具なので、`templates/` の外の `tools/store-screenshots/` に置く (手順は `tools/store-screenshots/README.md`)。
