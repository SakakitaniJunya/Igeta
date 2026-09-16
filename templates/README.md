# templates — 雛形置き場 (コピー元)

ここにあるファイルは**そのまま使わず、自分のリポジトリへコピーして使う**。`__name__` はプレースホルダ。

| フォルダ | コピー先 | コピーの仕方 |
|---|---|---|
| `docs/` | `your-repo/docs/` | 手でコピー。**フォルダ構成がコピー先と同じ**なので、置きたい場所と同じパスの雛形を選ぶ (`templates/docs/design/basic/flows/__flow__.md` → `docs/design/basic/flows/<業務名>.md`) |
| `api-module/` | `your-repo/apps/api/` | `npm run scaffold:module -- --context <name> --aggregate <Name>` |
| `api-shared-kernel/` | `your-repo/apps/api/` | 初回のみ `--include-kernel` を付ける |
| `web-feature/` | `your-repo/apps/web/` | `npm run scaffold:module -- --kind web --feature <name>` |

Igeta ルートの `docs/` は雛形ではなく、Igeta 自身の説明書。
