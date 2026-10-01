---
id: adr-0002-role-boundary-invariants
title: ADR-0002 読み手境界を守る不変条件と機械検査の対応
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-01
depends_on: [adr-0001-document-role-directories]
relates_to: [audience-directories, context-boundaries, provenance-and-agreement]
---

# ADR-0002: 読み手境界を守る不変条件と機械検査の対応

> **TL;DR**: ADR-0001 の `common`/`ai`/`person`/`client` 分割を「決めて終わり」にしないため、9 つの不変条件に
> 機械検査を対応させる。新設は 3 つ (`RoleBoundaryCheck`、`DocGraphCheck` 拡張、`AgentsEntrypointCheck`)。
> 読む範囲の規則 (AI は `ai`+`common`、人は `person`+`common`、顧客は `client` のみ) は依存方向検査で裏付ける
> - 実データ検証: `requirements`(ai) が `audience-layers`(common) に `depends_on` している既存の実例を確認し、
>   「ai→common」を許容方向として規則に追加した (CEO 原案には無かった方向)

## 関連

- **上流 (depends_on)**: ADR-0001
- **下流**: `src/checks/RoleBoundaryCheck.ts` (新設) / `src/checks/DocGraphCheck.ts` (拡張) / `src/core/Role.ts` (新設) / `src/checks/AgentsEntrypointCheck.ts` (新設)

## Status

2026-10-01 提案。v1/v2 からの語彙変更 (ADR-0001 v3) に追随して改訂。arch-review 待ち。

## Context

4 分割が `specs`/`decisions`/`guides`/`delivery`(v2, 役割=正本/決定/人の入口/提出物) から `common`/`ai`/`person`/
`client`(v3, 読み手そのもの) に変わったため、不変条件の宛先 (区分) 名を更新し、読む範囲の規則を依存方向検査として
明文化する。`context-contract` は AI が `context-files` で読む実例 (context-boundaries.md §3) があるため
`person` から `common` へ移す。

## Decision Drivers

- 決定的な機械検査のみ、検査の無い条件は採らない、既存検査を壊さない

## Decision

**採用: 以下 9 条件。**

| # | 不変条件 | 検査 | 新設/既存 |
|---|---|---|---|
| 1 | kind→読み手の正本は 1 か所 | `Role.test.ts` が重複キー 0 件を assert | 新設 (`src/core/Role.ts`) |
| 2 | 読み手は第1階層の置き場所で分かる | `RoleBoundaryCheck`: kind から導く読み手と実際の第1階層の食い違いを違反 | 新設 |
| 3 | 依存方向: どの区分も `common` を参照してよい (`common` 自身は `common` のみに依存)。`person`/`client` は `ai` を参照してよい。`ai` は `person`/`client` を参照しない | `DocGraphCheck` 拡張 (depends_on・本文リンク・修飾 ID の参照先/元の読み手を見る) | 既存拡張 |
| 4 | 読む範囲: AI は `ai`+`common`、人は `person`+`common`、顧客は `client` のみ | #3 の依存方向検査で裏付ける (単独の検査は持たない) | #3 を流用 |
| 5 | 1 タスクで読む量に上限 | 既存の行数上限・`context-size`・`context-files` | 既存 |
| 6 | 品質の門は決定的な機械検査 | 既存の全検査 (正規表現・SHA256・文字列一致)。新設も同型 | 既存の型を継承 |
| 7 | 未決は未決と書く | 既存 decision-log の DEC/OPEN・`checkAcceptedGate` | 既存 |
| 8 | 作る主体と裁く主体を分ける (delivery 限定) | 既存 `provenance-accept` の self-approved 違反 | 既存 |
| 9 | AI の入口は repo 直下の 1 ファイル | `AgentsEntrypointCheck`: `AGENTS.md` の実在と `ai/`・`common/` への言及 | 新設 |

`context-contract` は `common/` 配下 (他のまとまりへの約束を人も AI も読む、§1 参照)。`map`/`decision-log` は
既存 `context-files` の既定 allowlist に残る (`context-boundaries.md` §6) が新配置では `person/` 専有なので、
AI の既定読み取りからは外れる。この食い違いは後続実装 (`context-files` のデフォルト allowlist 更新) で解消する
(再検討トリガ参照)。

## 却下した選択肢

- **条件 8 を ai/common/person にも広げる**: 編集権限の分離は git のレビュー工程が既に担う
- **条件 9 を `template-check` の kind 検査に混ぜる**: `AGENTS.md` は frontmatter を持たない

## Consequences

- 良い方向: 9 条件が全部「何で守るか」を持つ
- 代償: `context-files` の既定 allowlist (`map`) と新配置 (`person/`) の食い違いが後続実装の TODO として残る

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `Role.test.ts` (新設) | `src/core/Role.ts` の `ROLE_OF_KIND` | 同じ kind が 2 つの読み手に登録される |
| `RoleBoundaryCheck.test.ts` (新設) | fixture の `docs/common`・`ai`・`person`・`client` | kind 不一致を検出しない回帰 |
| `AgentsEntrypointCheck.test.ts` (新設) | fixture の `AGENTS.md` | ファイル無し・リンク無しを検出しない回帰 |

## 再検討トリガ

- `context-files` の既定 allowlist から `map` を外すか `person` も対象にするかを、後続実装で決める
- 新設検査の本番投入後、既存 2 消費 repo で誤検出が 3 件以上出たら判定ロジックを見直す
