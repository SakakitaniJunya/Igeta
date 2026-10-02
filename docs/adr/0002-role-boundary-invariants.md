---
id: adr-0002-role-boundary-invariants
title: ADR-0002 確定させる人の境界を守る不変条件と機械検査の対応
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-01
depends_on: [adr-0001-document-role-directories]
relates_to: [reader-granularity, folder-placement, template-realignment]
---

# ADR-0002: 確定させる人の境界を守る不変条件と機械検査の対応

> **TL;DR**: ADR-0001 の `person`/`ai`/`client` 分割を「決めて終わり」にしないため、13 の不変条件に
> 機械検査を対応させる。新設は 4 つ (`RoleBoundaryCheck`・`PersonFormCheck`・`AgentsEntrypointCheck`・
> `approval-scope`)。量の上限は、1 本の行数を違反、まとまりの合計字数を警告で始める。検査の無い条件は採らない

## 関連

- **上流 (depends_on)**: ADR-0001
- **下流**: `src/core/Role.ts` / `src/checks/{RoleBoundaryCheck,PersonFormCheck,AgentsEntrypointCheck}.ts` (新設) / `src/checks/DocGraphCheck.ts` (拡張)

## Status

2026-10-02 提案 (ADR-0001 v4 に追随。arch-review v4 round 1 の FIX を反映)。arch-review 待ち。

## Context

分ける基準が「確定させる人」に変わり、`common/` が無くなった。新しく要るのは、`person/` が人の読める型と量を
保つこと、`ai/` が人の決定から浮かないこと、人の承認が要る変更を機械で見分けること、承認済みの決定が
いまの設計に反映されていること。

## Decision Drivers

- 門は決定的な機械検査だけ (正規表現・文字列一致・件数・SHA256)。モデルに裁かせない
- 守らせ方の無い条件は採らない。実測の無い数値は違反にしない

## Decision

**採用: 以下 13 条件。**

| # | 不変条件 | 検査 | 強さ |
|---|---|---|---|
| 1 | kind → 置き場所の正本は 1 か所 | `Role.test.ts`: `ARC42_BY_KIND` と集合が一致し、重複 0 件 | 違反 |
| 2 | 置き場所は第1階層とまとまりのフォルダで分かる。フォルダ名と `context` が一致する | `RoleBoundaryCheck` | 違反 |
| 3 | 依存は上流へ: `ai` → `person`、`client` → `person`・`ai`。`person` は `ai`・`client` を指さない | `DocGraphCheck` 拡張 (`depends_on`・`relates_to`・本文リンク・修飾 ID) | 違反 |
| 4 | `ai/specs/` の文書は `depends_on` を辿ると `person/` に届く | `DocGraphCheck` 拡張 | 違反 |
| 5 | `person/` の行頭が ID の行は `状態` (決定・仮・未決・廃) を持つ。決まりの表が 1 つも無い文書は違反 | `PersonFormCheck` | 違反 |
| 6 | 図が要る kind (map・context-map・business-flow・screen-spec・solution-strategy・as-is-overview) に図が 1 枚以上 | `PersonFormCheck` | 違反 |
| 7 | 「いまの決まり」1 本は 100 行まで (`requirements` は 150 行) | `PersonFormCheck` | 違反 |
| 8 | まとまりの合計 15,000 字、全体共通 (要件 + `design/shared/`) 30,000 字まで | `PersonFormCheck` | 警告。次のメジャー版で違反 |
| 9 | `廃` にした ID を別の行で使い直さない | `PersonFormCheck` | 違反 |
| 10 | 仮と未決は 1 か所に集まる | 決定台帳の生成一覧を `person/` の状態の列まで広げる | 生成 |
| 11 | 人の承認が要る変更を見分ける | `approval-scope` (ADR-0008) | 違反 |
| 12 | 承認済みの ADR は、いまの設計に反映されている: `accepted` の ADR の番号を、`person/requirements/` か `person/design/` のどれかの行が引く | `DocGraphCheck` 拡張 (`superseded` の ADR は対象外) | 違反 |
| 13 | AI の入口は repo 直下の `AGENTS.md`。docs/ の文書は 3 フォルダか `nonDocPaths` のどちらかに属する | `AgentsEntrypointCheck` / `RoleBoundaryCheck` | 違反 |

条件 8 を警告で始める理由: 上限の値は、業務フロー 3 本の実測を他の文書へ当てはめた見込みから置いた
([型と量](../explanation/09-reader-granularity.md) §6)。違反に上げる時期は Igeta の版で決まり、利用 repo の設定では
変えられない (ADR-0005)。条件 12 は、人が古い ADR を読み返さなくても、いまの決まりが設計の文書だけで分かるための条件。

**読む範囲**: 人は `person/` のうち、自分のまとまりと全体共通を確定前に全部読む。AI は `context-files` が返す範囲を読む
([雛形の組み直し](../explanation/11-template-realignment.md) §4 の 5)。顧客は `client/` だけを読む。

## 却下した選択肢

- **「読みやすさ」を検査する**: 機械で決定的に判定できない。型・量・参照の向きだけを検査し、残りは承認のときに人が見る
- **合計の上限を最初から違反にする**: 実測の無い値で CI を止めると、上限を超えた文書を `ai/` へ押し出す誘因になる
- **条件 4 を行の単位にする**: 書く量が増えすぎる。文書単位に留め、行の追随は `review-sheet` の「要追随」欄で補う

## Consequences

- 良い方向: 13 条件が全部「何で守るか」を持つ。`person/` が膨らむと検査が知らせる
- 代償: 既存の基本設計は条件 5〜7 で落ちる。移行は書き直しを伴う (ADR-0003)。人の決定を `ai/` に書く誤りは
  どの条件でも落ちない (ADR-0001 の限界)

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `Role.test.ts` (新設) | `ROLE_OF_KIND` | `ARC42_BY_KIND` と集合が食い違う / 重複がある |
| `RoleBoundaryCheck.test.ts` (新設) | fixture の 3 フォルダ | 置き場所・`context` の不一致、第 3 の場所を検出しない |
| `PersonFormCheck.test.ts` (新設) | fixture の `person/` | 状態の欠け・図の欠け・行数超過・`廃` の使い直しを検出しない / 合計超過を警告しない |
| `DocGraphCheck` のテスト追加 | 向き・孤立・ADR の反映 | `person` → `ai` の参照、`person/` に届かない `ai/` 文書、どこからも引かれない `accepted` の ADR を検出しない |

## 再検討トリガ

- 条件 8 の測定 ([型と量](../explanation/09-reader-granularity.md) §6) が済んだら、値を改め、違反に上げる
