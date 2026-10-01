---
id: adr-0002-role-boundary-invariants
title: ADR-0002 承認者の境界を守る不変条件と機械検査の対応
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-01
depends_on: [adr-0001-document-role-directories]
relates_to: [reader-granularity, folder-placement]
---

# ADR-0002: 承認者の境界を守る不変条件と機械検査の対応

> **TL;DR**: ADR-0001 の `person`/`ai`/`client` 分割を「決めて終わり」にしないため、11 の不変条件に
> 機械検査を対応させる。新設は 4 つ (`RoleBoundaryCheck`・`PersonFormCheck`・`AgentsEntrypointCheck`・
> `approval-scope`)、既存の拡張は 1 つ (`DocGraphCheck`)。検査の無い条件は条件にしない

## 関連

- **上流 (depends_on)**: ADR-0001
- **下流**: `src/core/Role.ts` (新設) / `src/checks/RoleBoundaryCheck.ts`・`PersonFormCheck.ts`・`AgentsEntrypointCheck.ts` (新設) / `src/checks/DocGraphCheck.ts` (拡張)

## Status

2026-10-02 提案 (ADR-0001 v4 に追随して全面改訂)。arch-review 待ち。

## Context

分ける基準が「読み手」から「承認者」に変わった (ADR-0001 v4)。`common/` が無くなり、依存の向きが単純になる。
新しく要るのは、`person/` の文書が人の読める型と量を保つこと、`ai/` の設計が人の決定から浮かないこと、
人の承認が要る変更を機械で見分けられること。

## Decision Drivers

- 決定的な機械検査だけを門にする (正規表現・文字列一致・件数・SHA256)。モデルに裁かせない
- 守らせ方の無い条件は採らない。既存検査を壊さない

## Decision

**採用: 以下 11 条件。**

| # | 不変条件 | 検査 | 新設/既存 |
|---|---|---|---|
| 1 | kind→承認者と置き場所の正本は 1 か所 | `Role.test.ts` が重複 0 件・47 kind の網羅を assert | 新設 (`src/core/Role.ts`) |
| 2 | 承認者は第1階層で分かる。まとまりはフォルダ名と `context` が一致する | `RoleBoundaryCheck`: kind から導く置き場所と実際のパスの食い違いを違反 | 新設 |
| 3 | 依存は上流へ向かう: `ai` → `person`、`client` → `person`・`ai`。`person` は `ai`・`client` を指さない。`ai` は `client` を指さない | `DocGraphCheck` 拡張 (`depends_on`・本文リンク・修飾 ID) | 既存拡張 |
| 4 | `ai/` の設計は人の決定から浮かない: `ai/` の文書は `depends_on` を辿ると `person/` の文書に届く | `DocGraphCheck` 拡張 | 既存拡張 |
| 5 | `person/` の「いまの決まり」は人の読める型: `ai/` 側の ID を書かない、決まりの各行に状態、図 1 枚以上 | `PersonFormCheck` | 新設 |
| 6 | `person/` の「いまの決まり」は全部読める量: 1 本 100 行、1 まとまり 15,000 字、全体共通 30,000 字 | `PersonFormCheck` | 新設 |
| 7 | AI が 1 作業で読む量に上限 | 既存の行数上限・`context-size`・`context-files` | 既存 |
| 8 | 未決は未決と書く。仮と未決は 1 か所に集まる | 既存 `checkAcceptedGate` + 決定台帳の生成一覧を `person/` の決まりの表の状態列まで広げる | 既存拡張 |
| 9 | 人の承認が要る変更を見分ける: `person/`・`client/` を含む変更は人の承認が要る | `approval-scope` (ADR-0008) | 新設 |
| 10 | AI の入口は repo 直下の 1 ファイル | `AgentsEntrypointCheck`: `AGENTS.md` の実在と `person/`・`ai/` への言及 | 新設 |
| 11 | docs/ の文書は 3 フォルダか `nonDocPaths` のどちらかに属する (ADR-0005 決定 1) | `RoleBoundaryCheck`: どちらにも属さない文書 (直下の生成索引を除く) を違反 | 新設 |

既存の「作る主体と裁く主体を分ける」(`provenance-accept` の self-approved 違反) は `client/` の提出物に
そのまま効く。条件 9 がそれを `person/` に広げる形になる (AI が書いた決まりは、人が承認するまで `仮`)。

**読む範囲**: 人は `person/` (自分のまとまり + 全体共通) を全部読む。AI は `context-files` が返す
「`person/` の該当まとまり + 全体共通 + `ai/` の該当まとまり + 隣の約束」を読む。顧客は `client/` だけを読む。

## 却下した選択肢

- **「読みやすさ」を検査する**: 機械で決定的に判定できない。型と量と禁止語だけを検査し、残りは承認のときに人が見る
- **コードの識別子 (バッククォート) を `person/` で禁止する**: 技術の選定を決める文書では要る。数を出すだけにする
- **条件 4 を「`ai/` の各行が `person/` の ID を引く」まで細かくする**: 行単位の対応は書く量が増えすぎる。
  文書単位の `depends_on` に留め、行の対応は `review-sheet` の「要追随」欄で補う

## Consequences

- 良い方向: 11 条件が全部「何で守るか」を持つ。`person/` が膨らむと検査が落ちるので、読める量が保たれる
- 代償: 既存の基本設計の文書は条件 5・6 で落ちる。移行は分け直しを伴う (ADR-0003)

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `Role.test.ts` (新設) | `ROLE_OF_KIND` | 同じ kind が 2 つの承認者に登録される / 47 kind に欠けがある |
| `RoleBoundaryCheck.test.ts` (新設) | fixture の 3 フォルダ | 置き場所・`context` の不一致、第 3 の場所を検出しない |
| `PersonFormCheck.test.ts` (新設) | fixture の `person/` | `ai/` の ID・量の超過・状態の欠け・図の欠けを検出しない |
| `DocGraphCheck` のテスト追加 | 依存の向き・`ai/` の孤立 | `person` → `ai` の参照、`person/` を指さない `ai/` 文書を検出しない |

## 再検討トリガ

- 量の上限 (条件 6) は実案件 1 件の実測から置いた。最初の実案件を全部分け直したら測り直す
