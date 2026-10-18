# AGENTS.md

AI がこの repo で作業するときの入口。

## 読む順

1. `docs/person/` が上流。人が決めた決まり。全体の地図 (`docs/person/design/shared/00-map.md`) から読む
2. `docs/ai/` が持ち場。作り方の仕様と手引き
3. `docs/client/` は提出物。顧客に渡す文書

## 人の承認

- 変更を取り込む前に、`git fetch origin` の後で `igeta approval-scope --base origin/<宛先のブランチ>` で確かめる
- 結果が `human` か検査不能なら、AI は取り込まずに人へ渡す
- `docs/person/` の新しい決まりは、状態 `仮` で起案する。人が承認したら `決定` に変わる。この決まりは機械では強制されない

## 手引きの場所

Igeta の版に固定した手引き。

- `node_modules/igeta/templates/docs/ai/handbook/how-to/01-document-taxonomy.md` — 文書の種類・置き場所・型
- `node_modules/igeta/templates/docs/ai/handbook/how-to/03-human-review.md` — 人が読む文書 (地図・決定台帳・レビューシート) の読み方
- `node_modules/igeta/templates/docs/ai/handbook/how-to/04-provenance-workflow.md` — 提出物の章の由来の付け方

## 検査

- `npm run docs:check` — 索引・置き場所・本数・AI の入口と、承認する人の割り当て
- `npm run docs:template-check` — 文書の必須構造と、人の文書の型
