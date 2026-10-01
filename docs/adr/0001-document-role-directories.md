---
id: adr-0001-document-role-directories
title: ADR-0001 docs/ の第1階層を読み手4つに、第2階層に世界の慣習語彙を置く
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-01
depends_on: [audience-layers]
relates_to: [audience-directories, context-boundaries]
---

# ADR-0001: docs/ の第1階層を読み手4つに、第2階層に世界の慣習語彙を置く

> **TL;DR**: docs/ 第1階層は読み手 4 つ (`common`/`ai`/`person`/`client`、全て小文字)。各直下に、前版 (v2)
> で確認した世界の慣習語彙を第2階層として置く (`common/decisions`=MADR、`ai/specs`=spec-kit・OpenSpec、
> `person/guides`、`client/delivery`)。AI の入口は repo 直下 `AGENTS.md` (`ai/`・`common/` を指す)。
> v2 (`specs`/`decisions`/`guides`/`delivery` を第1階層) は CEO 差し戻しにより撤回: 慣習語彙は「正本である」こと
> は示すが「誰向けか」は示さず、CEO 最初の指摘に答えていなかった
> - 小文字固定の理由: 既存フォルダが全部小文字。macOS は大文字小文字を区別せず Linux の CI は区別するため、
>   大文字始まりは食い違いの元になる

## 関連

- **上流 (depends_on)**: [読み手別の入口](../explanation/03-audience-layers.md)
- **下流**: ADR-0002 / ADR-0003 / [要件定義書 — 読み手別ディレクトリ](../product/02-audience-directories.md) / `AGENTS.md` (新設)

## Status

2026-10-01 提案。v1 (`source`/`entrance`/`delivery`)・v2 (`specs`/`decisions`/`guides`/`delivery` を第1階層) は
いずれも差し戻し。本版 (v3) は CEO の直接指示に基づく。arch-review の裁定待ち。

## Context

CEO 原文 (v3): 「に分けるのはどう？わかりやすくない？その下に上記の設計にして欲しい / Common/ AI/ Person/ Client」。
v2 は「読み手の生の名前は shared の置き場所が無い」という v1 の却下理由を世界の慣習語彙で回避したが、結果として
「フォルダ名だけでは誰向けか分からない」という CEO の最初の指摘 (「どれが人間でどれがAIか」) に戻ってしまった。
CEO は読み手名を第1階層、v2 で確認した慣習語彙を第2階層にする形で両方を解いた。

## Decision Drivers

- 第1階層は読み手がフォルダ名だけで分かること / 第2階層は v2 の外部慣習語彙を無駄にしないこと / 既存フォルダの全小文字規約を守ること

## Decision

**採用:**

(簡略図。全体の内部構造の正本は [どの文書をどこに置くか](../explanation/10-folder-placement.md) §1)

```text
AGENTS.md                ← AI の入口 (ai/ と common/ を指す)
docs/
├── README.md / dependencies.md   ← 生成索引・依存グラフ (4分割を束ねる、直下に残す)
├── common/                 ← 人も AI も読む
│   └── decisions/          ← ADR (adr)
├── ai/                     ← AI が実装のために読む
│   └── specs/              ← requirements・design 配下・architecture
├── person/                 ← 人が読む
│   └── guides/             ← map・context-map・decision-log・feature-brief
└── client/                 ← 顧客に渡す
    └── delivery/           ← delivery-chapter (変更なし)
```

| フォルダ | 典拠 (開いて確認したもの) |
|---|---|
| `ai/specs/` | [spec-kit](https://github.com/github/spec-kit/blob/main/spec-driven.md)・[OpenSpec](https://github.com/Fission-AI/OpenSpec) (v2 で確認済み) |
| `common/decisions/` | [MADR](https://adr.github.io/madr/) (v2 で確認済み) |
| `person/guides/` | CEO の直接指示。外部慣習の裏付けは確認していない (正直に書く) |
| `client/delivery/` | Igeta 既存の用語。変更なし |
| `AGENTS.md` | [agents.md](https://agents.md/) (v2 で確認済み) |

`common/` には `decisions/` 以外にも複数 kind が入る (全数・内部構造は ADR-0004 と [どの文書をどこに置くか](../explanation/10-folder-placement.md) §3 が正本)。
深い文書 (5 階層) は kind 解決がパス非依存のため許容する。

## 却下した選択肢

- **v2 (慣習語彙を第1階層)**: 「正本である」ことは示すが「誰向けか」は示さない。CEO の最初の指摘に答えない
- **v1 の却下理由 (生の読み手名は shared の置き場所が無い) を維持する**: 誤りだったと訂正する。`common/` で解消する
- **CEO 原文のまま大文字始まり**: 既存フォルダは全小文字。macOS は大文字小文字を区別せず Linux の CI は区別するため
  食い違いの元になる (director が CEO へ確認予定)

## Consequences

- 良い方向: 第1階層が読み手を直接示す。v2 の慣習語彙の調査も第2階層として活きる
- 代償: 深い文書は5階層になる。`decisions/`(ADR) と `guides/`相当の`01-decisions.md`(決定台帳)が似た名前で紛らわしい
  (`AGENTS.md`・`docs/README.md`の文言で明示する)

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| ADR-0002 `RoleBoundaryCheck` (新設) | `docs/common`・`ai`・`person`・`client` 配下の全文書 | kind から導く読み手と実際の第1階層が食い違う |
| ADR-0002 `AgentsEntrypointCheck` (新設) | repo 直下 `AGENTS.md` | 存在しない、または `ai/`・`common/` への言及が無い |

## 再検討トリガ

- CEO が大文字始まりを再指示した場合は CI の大文字小文字差異を再説明してから従う。`how-to/` 改名が混乱を招けば別名を検討する
