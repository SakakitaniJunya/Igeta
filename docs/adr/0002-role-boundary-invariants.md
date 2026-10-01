---
id: adr-0002-role-boundary-invariants
title: ADR-0002 役割境界を守る不変条件と機械検査の対応
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

# ADR-0002: 役割境界を守る不変条件と機械検査の対応

> **TL;DR**: ADR-0001 の `specs`/`decisions`/`guides`/`delivery` 分割 + `AGENTS.md` を「決めて終わり」にしないため、
> 8 つの不変条件それぞれに機械検査を 1 つ対応させる。対応先の無い条件は採らない。新設は 3 つ (`RoleBoundaryCheck`、
> `DocGraphCheck` の逆参照禁止拡張、`AgentsEntrypointCheck`)。残り 5 つは既存検査で足りる

## 関連

- **上流 (depends_on)**: ADR-0001
- **下流**: `src/checks/RoleBoundaryCheck.ts` (新設) / `src/checks/DocGraphCheck.ts` (拡張) / `src/core/Role.ts` (新設) / `src/checks/AgentsEntrypointCheck.ts` (新設)

## Status

2026-10-01 提案。v1 (役割名 `source`/`entrance`/`delivery`) から ADR-0001 の語彙変更に追随して改訂。arch-review 待ち。

## Context

director 診断 3: 「モデルが進化してもしなくても回る」ための原則が明文化されていない。原則を「不変条件+検査」の対で書き、
検査の無い条件は採らないことで、宣言だけで終わる設計を防ぐ。ADR-0001 v2 で `decisions`/`AGENTS.md` が増えたため、
対応する不変条件も 1 件追加する。

## Decision Drivers

- 決定的な機械検査のみ (LLM に裁かせない)
- 検査の無い条件は条件にしない (無いものを書かない)
- 既存検査を壊さない・重複させない

## Decision

**採用: 以下 8 条件。4〜7 は既存検査で足り、新設は 1・2・8 のみ。3 は既存の `DocGraphCheck` の拡張。**

| # | 不変条件 | 検査 | 新設/既存 |
|---|---|---|---|
| 1 | kind→区分対応の正本は 1 か所 | `Role.test.ts` が対応表の重複キー 0 件を assert | 新設 (`src/core/Role.ts`、既存 `Audience.ts` と同型) |
| 2 | 読み手は置き場所で分かる (kind の区分と物理フォルダの食い違いは違反) | `RoleBoundaryCheck` (`template-check` に相乗り、新レイアウト検出時のみ作動。ADR-0003) | 新設 |
| 3 | 正本・決定は提出物を参照しない (逆方向禁止) | `DocGraphCheck` 拡張: 参照元 kind の区分が specs/decisions/guides、参照先 kind が `delivery-chapter` なら違反 | 既存ファイル拡張 |
| 4 | 1 タスクで読む量に上限 | 既存の行数上限 (150/200)・`context-size`・`context-files` | 既存 |
| 5 | 品質の門は決定的な機械検査 | 既存の全検査 (正規表現・SHA256・文字列一致のみ)。新設 1・2・8 も同型 | 既存の型を継承 |
| 6 | 未決は未決と書く | 既存 decision-log の DEC/OPEN・`checkAcceptedGate` | 既存 |
| 7 | 作る主体と裁く主体を分ける | 既存 `provenance-accept` の self-approved 違反 (delivery 限定) | 既存 (specs/decisions/guides には及ばない) |
| 8 | AI の入口は repo 直下の 1 ファイルに固定する (フォルダではない) | `AgentsEntrypointCheck`: `AGENTS.md` の実在と、`specs/`・`decisions/` へのリンク (または相対パス言及) の有無 | 新設 |

## 却下した選択肢

- **条件 7 を specs/decisions/guides にも広げる**: 編集権限の分離は git のレビュー工程 (PR 承認) が既に担う。文書側に二重の検査を足す必要は無い
- **条件 2 を既定で常時 violation にする**: 旧レイアウトの既存 2 消費 repo を無警告で赤くする。ADR-0003 でレイアウト検出型の opt-in にした
- **条件 8 を `template-check` の kind 検査に混ぜる**: `AGENTS.md` は frontmatter を持たない (kind 概念の外)。別チェックに分ける方が既存の kind 検査を汚さない

## Consequences

- 良い方向: 8 条件が全部「何で守るか」を持つ。宣言だけの原則が残らない
- 代償: `RoleBoundaryCheck`・`DocGraphCheck` 拡張・`AgentsEntrypointCheck` の実装・テストが新規に要る (本 ADR はその着手を要求する。実装は別タスク)

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `Role.test.ts` (新設) | `src/core/Role.ts` の `ROLE_OF_KIND` | 同じ kind が 2 つの区分に登録される |
| `RoleBoundaryCheck.test.ts` (新設) | fixture の `docs/specs`・`decisions`・`guides`・`delivery` | kind 不一致を検出しない回帰 |
| `AgentsEntrypointCheck.test.ts` (新設) | fixture の `AGENTS.md` | ファイル無し・リンク無しを検出しない回帰 |

## 再検討トリガ

- 2・3・8 の新設検査を本番投入した後、既存 2 消費 repo で誤検出 (false positive) が 3 件以上出たら判定ロジックを見直す
