---
id: adr-0003-docs-model-migration-and-dogfooding
title: ADR-0003 移行コマンド (適用まで) と対象範囲
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-01
depends_on: [adr-0001-document-role-directories, adr-0002-role-boundary-invariants]
relates_to: [audience-directories, export-deliverable]
---

# ADR-0003: 移行コマンド (適用まで) と対象範囲

> **TL;DR**: 移行は 2 段。① `igeta docs-migrate` が置き場所を移す (適用まで行う) ② `person/` の文書を人の型へ
> 分け直す (`PersonFormCheck` の違反一覧が作業の列)。②が済むまで完了としない。`nonDocPaths` は配置判定と
> 移動対象の選定だけを免除し、`FolderSizeCheck`・kind 宣言の有無は免除しない (迂回口にしない、ADR-0005 §1 と対)
> - 由来 sidecar・合意台帳・食い違いログの移行時の扱いは [由来・台帳の移行時の扱い](./0006-provenance-migration-handling.md)

## 関連

- **上流 (depends_on)**: ADR-0001 / ADR-0002
- **下流**: `igeta docs-migrate` (新設) / ADR-0006 / Igeta 自身の docs/ 移行 / 2 消費 repo への適用

## Status

2026-10-02 提案 (ADR-0001 v4 に追随。分け直しの段を追加)。arch-review 待ち。

## Context

CEO 指摘「35 本規模を人手で動かす前提は成り立たない」で適用まで行う方式へ。arch-review: 「explanation 8 本を
移動しない」を維持すると Igeta 自身の移行後に 3 フォルダの外に文書が残り、Igeta 自身の CI が赤くなる。
`nonDocPaths` も ADR-0005 が却下した迂回口と同じ穴を持っていた。ADR-0001 v4 で、基本設計は移すだけでは
読みきれないと分かった (実測 37 本・約 31 万字)。人が決める内容だけへ分け直す段が要る。

## Decision Drivers

- Igeta 自身の移行後、3 フォルダの外に文書が 1 本も残らないこと (dogfooding が自己矛盾しない)
- `nonDocPaths` のような「対象外」宣言が、検査そのものを無効化する迂回口にならないこと
- 35 本規模は人手の書き換えが現実的でない

## Decision

1. **移行は 2 段**: ① 置き場所を移す (機械。`docs-migrate`) ② `person/` の文書を人の型へ**分け直す** (書き直し。
   `PersonFormCheck` の違反一覧が作業の列になる)。②が済むまで移行は完了としない (PR の中で①②を済ませてから merge)。
   分け直しでは既存の ID の番号を変えず、再利用もしない。削った作り方の詳細は、同じまとまりの `ai/` の文書に
   既にあるかを確かめ、無ければそこへ移す。Igeta 自身の explanation 01〜10 は `person/handbook/explanation/` へ移す
2. **移行コマンド**: `igeta docs-migrate <dir> [--dry-run]`。既定は適用。(a)ファイル移動 (b)相対リンク書き換え
   (c)README索引・export manifest書き換え (d)kind→承認者と `context` に基づく配置 (e)`AGENTS.md`新設 (f)由来sidecar等の
   移行 (ADR-0006) を一括で行う
3. **適用前後の安全策**: 適用前に git clean を要求、適用後に `docs:check`/`docs:graph` を自動実行し失敗を報告
4. **移行元は 2 種類**: 旧レイアウト (kind 別フォルダが docs 直下) と、v3 の 4 フォルダ (`common/` あり。
   先行して手で移した repo が 1 つある)。どちらからも同じ置き場所表で移す。`docs/common/` が残っていたら違反
5. **対象範囲と順序**: ① Igeta 自身 → ② 既存消費2 repo。大規模な社内 repo (凍結予定) は対象外 (director確認)
6. **kind 無しの文書**: 止めて一覧を出す。推定で黙って置かない
7. **`nonDocPaths` (新設、glob配列) が免除するのは2つだけ**: (a) `RoleBoundaryCheck` の配置判定 (b)
   `docs-migrate` の移動対象選定。**免除しない**: `FolderSizeCheck`(15本、kindと無関係に数える) / frontmatter に
   Igeta の `kind` を宣言した文書 (宣言があれば `nonDocPaths` ごと違反。設計書を業務文書と偽れない)。
   `nonDocPaths` の glob が `docs/person`・`ai`・`client` 配下に当たる設定自体も違反 (ADR-0005 §1 と対)
8. **版が古い repo の手順**: ①版上げ ②`analyze --list-unmanaged` で一覧 ③全件解決後に `docs-migrate`

Igeta 自身の移行後の木 (3 フォルダの外に何も残らないことの確認):

```text
docs/
├── README.md / dependencies.md        (生成、直下に残す)
└── person/
    ├── requirements/{01-requirements,02-audience-directories}.md
    ├── design/shared/{00-map,02-solution-strategy}.md
    ├── decisions/2026/0001〜0007-*.md
    └── handbook/explanation/01〜10-*.md
```

(`ai/` と `client/` は、該当する文書が無いため作らない)

## 却下した選択肢

- **`nonDocPaths` が3検査を丸ごと免除する (前版)**: ADR-0005 が却下した「設定で迂回できる形」と同じ穴
- **explanation は移動しない (前版)**: Igeta 自身の移行後に文書が 3 フォルダの外に残り、自己矛盾する
- **大規模な社内 repo も一括移行**: 凍結予定の repo に工数をかける理由が無い

## Consequences

- 良い方向: `nonDocPaths` が「設計書を業務文書と偽って逃げる」余地を持たない。Igeta 自身の移行で何も残らない
- 代償: `nonDocPaths` 配下も `FolderSizeCheck` の対象になるため、業務文書の平置き (実測16本) も直す対象になる

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `docs-migrate` 適用後の `docs:check`/`docs:graph` | 移行対象 repo | 壊れたリンクが残る/explanation が外に残る |
| `nonDocPaths` 設定検査 (新設) | `.igeta.json` | 3 フォルダに重なる glob、kind宣言ファイルを含む glob を許す回帰 |
| kind 無しファイルの事前検査 | 移行対象 repo | 1件でも残っているのに適用へ進む回帰 |

## 再検討トリガ

- 2 消費 repo への適用後、書き換え漏れが実測されたら正規表現の網羅性を見直す
- 大規模 repo の凍結が解除されたら対象に含めて計画を立てる
