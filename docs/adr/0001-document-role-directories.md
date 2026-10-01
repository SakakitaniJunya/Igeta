---
id: adr-0001-document-role-directories
title: ADR-0001 docs/ の第1階層を世界の慣習の語彙で4分割する
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

# ADR-0001: docs/ の第1階層を世界の慣習の語彙で4分割する

> **TL;DR**: docs/ 直下を `specs`(正本) / `decisions`(ADR) / `guides`(人の入口) / `delivery`(提出物) の
> 4 フォルダに分ける。フォルダ名は独自語ではなく spec-driven 開発・MADR・agents.md の実在する慣習から採る。
> AI の入口はフォルダではなく repo 直下の `AGENTS.md`。`decisions` を独立させた結果、トップは CEO 原文の
> 「三つに」と数が食い違う (却下した選択肢参照)
> - v1 (本 ADR の前版、`source`/`entrance`/`delivery`) は director 差し戻しにより撤回。独自語で世界の慣習に
>   乗っていなかったことが理由

## 関連

- **上流 (depends_on)**: [読み手別の入口](../explanation/03-audience-layers.md)
- **下流**: [要件定義書 — 読み手別ディレクトリ](../product/02-audience-directories.md) / [文書体系ガイド](../../templates/docs/guides/01-document-taxonomy.md) §2・§3 (改訂対象) / ADR-0002 / ADR-0003 / `AGENTS.md` (新設)

## Status

2026-10-01 提案 (architect, eng-base)。v1 は director 差し戻し。本版 (v2) は再提案、arch-review の裁定待ち。

## Context

CEO 原文: 「どれが人間が読むもので、AIがどれかわかりません」「フォルダで大きく三つに分けちゃえばいいのに」(fd.md)。
v1 で `source`/`entrance`/`delivery` を採ったが、director 差し戻し: 「`source` はソースコードと読まれやすく、
`entrance` は文書の分類語として使われていない」— 独自語で世界の慣習に乗っていなかった。

## Decision Drivers

- フォルダ名は Igeta の独自語ではなく、**実在して開いて確認できる外部の慣習**から採ること
- 決定 (ADR) は人も AI も読む、どちらの読み手にも属さない層であること
- 既存の kind 別フォルダ構成への投資を無駄にしないこと

## Decision

**採用: `specs`/`decisions`/`guides`/`delivery` の 4 分割。AI の入口は `AGENTS.md` (repo 直下、フォルダではない)。**

| フォルダ/ファイル | 意味 | 収める kind | 典拠 (URL・確認した引用) |
|---|---|---|---|
| `docs/specs/` | 正本。AI が実装のために読む | `requirements`/`design/` 配下全部 (basic・detail・test・ops・tasks)/`architecture` | [spec-kit](https://github.com/github/spec-kit/blob/main/spec-driven.md) 「Creates the proper `specs/[branch-name]/` structure for all related documents」/ [OpenSpec](https://github.com/Fission-AI/OpenSpec) 「`openspec/specs/` — 確定した要件仕様 (`changes/` と別)」 |
| `docs/decisions/` | ADR。人も AI も読む唯一の層 | `adr` | [MADR](https://adr.github.io/madr/) 「Create folder `docs/decisions` in your project. Copy all files in folder `template`...」 |
| `docs/guides/` | 人の入口。Diátaxis で分ける | `map`/`context-map`/`context-contract`/`decision-log`/`feature-brief`/`explanation`/`guide`/`runbook`/`proposal`/`document-taxonomy` | [Diátaxis](https://diataxis.fr/) (既に `explanation/01-design-doc-standards.md` で採用済み) |
| `docs/delivery/` | 提出物。顧客に渡す (変更なし) | `delivery-chapter` | — |
| `AGENTS.md` (repo 直下) | AI の入口。`specs/`・`decisions/` を指す | — (フォルダではない) | [agents.md](https://agents.md/) 「a dedicated, predictable place to provide the context and instructions to help AI coding agents work on your project」 |

**未確認 (開けなかった/確認できなかった)**: Kiro の `.kiro/specs/` — <https://kiro.dev/docs/specs/> を開いたが `.kiro` という
文字列自体の言及が無く、ディレクトリパスは確認できなかった。director 原案にあった根拠だが、本 ADR では**採用の根拠から外す**
(採用自体は spec-kit・OpenSpec の 2 件で十分)。

既存 kind 別サブフォルダ構成はそのまま、各フォルダの下に 1 段深く入れる (例: `docs/specs/product/01-requirements.md`、
`docs/guides/explanation/01-design-doc-standards.md`)。`docs/README.md`・`dependencies.md` は全 4 フォルダを束ねる
生成索引・依存グラフのため docs/ 直下に残す。`00-map.md`・`01-decisions.md` は `guides/` の内容として `guides/` 配下へ移す。

## 却下した選択肢

- **`source`/`entrance`/`delivery` (v1、本 ADR の前版)**: `source` はソースコードと読まれやすく、`entrance` は文書の
  分類語として世界で使われていない。独自語は CEO・開発者の双方にとって学習コストになる
- **3 分割を維持し ADR を `specs/` か `guides/` に同居させる**: CEO 原文の「三つに」と数は合うが、**決定 (ADR) は人も
  AI も読む唯一の層で、どちらに入れても読み手の境界表示が嘘になる**。`specs/` に入れれば「ADR は AI だけが読む」という
  誤った境界を表示し、`guides/` に入れれば「AI は決定を読まない」という誤った境界を表示する。4 分割はこの矢を示すために
  数の一致より正確さを優先した (CEO への確認事項として再検討トリガに残す)
- **フォルダ名の読み手直書き (`customer`/`developer`/`ai`)**: v1 から継続して却下 (shared の置き場所の問題は変わらない)

## Consequences

- 良い方向: フォルダ名が全部、開いて確認できる外部の慣習に対応する。AI の入口が `AGENTS.md` という業界共通の
  約束に乗ることで、他のコーディングエージェント (Claude/Copilot/Cursor 等) からも同じ入口が機能する
- 代償: トップが CEO の「三つに」と数で食い違う (上記却下案参照、CEO 確認が要る)。`docs/decisions/`(ADR フォルダ) と
  `guides/` 配下の `01-decisions.md`(決定台帳、kind: decision-log) が似た名前で紛らわしい (別物であることを
  `AGENTS.md`・`docs/README.md` の文言で明示する必要がある)

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| ADR-0002 `RoleBoundaryCheck` (新設) | `docs/specs`・`decisions`・`guides`・`delivery` 配下の全文書 | kind から導く区分と実際の物理フォルダが食い違う |
| ADR-0002 `AgentsEntrypointCheck` (新設) | repo 直下 `AGENTS.md` | 存在しない、または `specs/`・`decisions/` への言及が無い |

## 再検討トリガ

- CEO が「三つに」を厳密な制約として再度明示した場合、`decisions/` を `specs/` か `guides/` へ同居させる案を再検討する
- Kiro の `.kiro/specs/` が別途確認できたら、典拠に追加する (採用結果は変えない)
