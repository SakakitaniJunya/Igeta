---
id: adr-0003-docs-model-migration-and-dogfooding
title: ADR-0003 移行は「移す」と「人の型へ書き直す」の 2 段で、1 本の PR にする
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-01
depends_on: [adr-0001-document-role-directories, adr-0002-role-boundary-invariants]
relates_to: [audience-directories, adr-0010-value-ownership]
---

# ADR-0003: 移行は「移す」と「人の型へ書き直す」の 2 段で、1 本の PR にする

> **TL;DR**: ① `igeta docs-migrate` が置き場所を移す (機械、適用まで) ② `person/` の文書を人の型へ書き直す
> (`PersonFormCheck` の違反一覧が作業の列)。①②は 1 本の PR で済ませてから merge する。書き直しでは ID の番号を
> 変えず、作り方だけの行は `ai/` の新しい ID へ移して元の行を `廃` にする。削る詳細は捨てずに `ai/` へ移す

## 関連

- **上流 (depends_on)**: ADR-0001 / ADR-0002
- **下流**: `igeta docs-migrate` (新設) / ADR-0006 / Igeta 自身の docs/ 移行 / 利用 repo 2 つへの適用

## Status

2026-10-02 提案。

## Context

基本設計は移すだけでは読みきれない (実測 37 本・約 31 万字)。書き直すと ID・由来・合意台帳が絡む。先に手で
v3 の構成 (`common/` あり) へ移した repo は、Igeta の版を上げた瞬間に新しい構成と判定され、全検査が違反になる。

## Decision Drivers

- 移行の途中の状態で merge しない / 書き直しで情報を失わず、ID の参照と由来を壊さない

## Decision

1. **2 段を 1 本の PR で**: ① 移す ② 書き直す。①だけの merge はしない。v3 の構成の repo は「版上げ + ① + ②」を 1 本にする
2. **移行コマンド**: `igeta docs-migrate --owner <持ち主> [--dry-run]`。既定は適用。(a) ファイル移動 (b) 相対リンク書き換え
   (c) 索引の再生成 (d) kind と `context` による配置 (e) `AGENTS.md`・`.github/CODEOWNERS`・門の workflow の新設 (ADR-0008)
   (f) 由来の付属ファイルの移行 (ADR-0006) (g) Igeta の手引き 3 本の写しのうち、過去の版の手引きと同じものだけ消す
   (違う写しは止めて一覧に出す。消した文書の id を指す `depends_on`・`relates_to` も外す)。適用前に作業ツリーが
   clean であることを要求し、適用後に完了条件を確かめる。細目は [テスト仕様 — 移行コマンド](../design/test/specs/07-docs-migrate.md)
3. **移行元は 2 種類**: 旧い構成 (kind 別フォルダが docs 直下) と v3 の構成。どちらからも同じ置き場所表で移す。
   `docs/common/` が残っていたら違反
4. **止めるもの・知らせるもの**: kind の無い文書は止めて一覧を出す (推定で置かない)。`context` の無い文書は `shared` に置き、一覧で知らせる
5. **書き直しの決まり (②)**:
   - ID の番号は変えない。人の決まりに当たる行は、業務の言葉で書き直して残す
   - 作り方だけの行は、受け皿の `ai/` の kind の新しい ID で書き、その行が元の ID を引く。`person/` の元の行は
     `| BF-121 | (作り方のため ai/ へ移した) | 廃 |` にする (移動先を書かない。ADR-0002 条件 9)
   - 削った列・詳細は、同じまとまりの `ai/` の文書へ移す (捨てない)。値の持ち主は ADR-0010 のとおり
   - `person/` の文書から `ai/`・`client/` への参照 (`depends_on`・`relates_to`・本文リンク) を外す。逆向きに張り直す
   - `accepted`・`amended` の ADR の番号を、要件か設計のどれかの行から引く (ADR-0002 条件 13)
   - 由来・合意への影響は ADR-0006 決定 6
6. **`nonDocPaths` (glob の配列) が免除するのは 2 つだけ**: `RoleBoundaryCheck` の置き場所の判定と、`docs-migrate`
   の移動対象の選定。`FolderSizeCheck` は免除しない。frontmatter に Igeta の `kind` を書いた文書は免除できない。
   glob が `docs/person`・`ai`・`client` の配下に当たる設定は、設定そのものが違反
7. **対象と順序**: Igeta 自身 → 利用 repo 2 つ。凍結予定の大きな社内 repo は対象外。版の古い repo は
   版上げ → `analyze --list-unmanaged` で一覧 → 全件解決 → ①②

Igeta 自身の移行後 (①②の後) の木。3 フォルダの外に文書は残らない。

```text
AGENTS.md / .github/CODEOWNERS / .github/workflows/igeta-gate.yml   (新設)
docs/
├── README.md / dependencies.md              (生成)
├── person/
│   ├── requirements/{01-requirements,02-audience-directories}.md
│   ├── design/shared/{00-map,02-solution-strategy}.md
│   └── decisions/2026/0001〜0010-*.md
└── ai/handbook/explanation/01〜10-*.md
```

②で直すもの: 要件 2 本・解決戦略・地図に `状態` の列と ADR の引用を足し、解説への参照を外す (解説の側が ADR・要件を
`depends_on` で指す)。入口の 3 行 (`AUDIENCE_ENTRANCE`) を新しい構成に替える。解説 03〜09 は Igeta 自身の機能の決めを
まだ持つので、当面は `humanPaths` で人の承認が要る側に置き (ADR-0008)、person の行への書き直しは後の作業にする。

## 却下した選択肢

- **①だけ先に merge する**: 検査が全部落ちたまま main に残る。**ID を振り直す**: 他の文書・由来・台帳からの参照が切れる
- **削る詳細を捨てる**: 既存の設計にしか書かれていない作り方が失われる

## Consequences

- 良い方向: main には「移す前」か「書き直し済み」の 2 状態しか無い。代償: PR が大きく、人が `person/` を全部読むまで merge できない

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `docs-migrate` 適用後の全検査 | 移行対象の repo | 壊れたリンク・3 フォルダの外の文書・`docs/common/` が残る |
| `nonDocPaths` の設定検査 (新設) | `.igeta.json` | 3 フォルダに当たる glob、kind を書いた文書を含む glob を許す |
| kind 無しの事前検査 | 移行対象の repo | 1 件でも残っているのに適用へ進む |

## 再検討トリガ

- 利用 repo への適用で書き換え漏れが見つかったら、書き換えの対象を見直す
