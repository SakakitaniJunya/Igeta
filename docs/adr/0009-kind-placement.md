---
id: adr-0009-kind-placement
title: ADR-0009 kind 47 種の置き場所と、増えたときの分け方
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-02
depends_on: [adr-0001-document-role-directories, adr-0004-folder-internal-structure-and-growth]
relates_to: [adr-0010-value-ownership]
---

# ADR-0009: kind 47 種の置き場所と、増えたときの分け方

> **TL;DR**: kind ごとの置き場所の正本。`person/` 18・`ai/` 27・`client/` 2 の計 47。文書を置ける場所はこの表のパスと
> 生成索引だけ。「型の検査」が ○ の kind は状態の列・行数・図を検査する。Igeta の手引き 4 本は利用 repo に写さない

## 関連

- **上流 (depends_on)**: ADR-0001 (確定させる人で分ける) / ADR-0004 (まとまりと年で分ける、15 本)
- **下流**: `src/core/Role.ts` / 文書体系ガイド §2 (実装時に転記) / ADR-0010

## Status

2026-10-02 提案 (arch-review v4 round 2 の FIX-1・4・8 を受け、解説から決めを移した)。arch-review 待ち。

## Context

置き場所の表を解説 (承認の要らない側) に置いていたため、ADR が承認の要らない文書を正本として指していた。
型の検査を掛ける kind も決まっておらず、ID の行を持たない kind まで掛かっていた。

## Decision Drivers

- 置き場所の決めは人が承認する文書に 1 つだけ置く / 型の検査を掛ける kind を明示する

## Decision

**1. `person/` (18)** — ○ = 状態の列・決まりの表・100 行 (requirements は 150 行)・(図) の kind は図。図 = 図だけ。— = 検査なし

| kind | 置き場所 | 型の検査 |
|---|---|---|
| map / context-map | `design/shared/00-map.md` / `design/<c>/00-map.md` | 図 |
| requirements | `requirements/01-requirements.md`・`requirements/NN-slug.md` | ○ |
| function-list / solution-strategy (図) / nonfunctional / permission-matrix / data-management / as-is-overview (図) / risks-tech-debt / operations / migration-plan | `design/shared/NN-*.md` (固定番号) | ○ |
| business-flow (図) / screen-spec (図) | `design/<c>/{flows,screens}/NN-slug.md` | ○ |
| glossary / feature-brief | `design/shared/NN-glossary.md` / `design/<c>/features/NN-slug.md` | — |
| adr / decision-log | `decisions/<year>/NNNN-slug.md` / `decisions/01-decisions.md` | — |

`<c>` はまとまりの名前で、`shared` を含む (まとまりに属さない業務・画面・機能は `design/shared/{flows,screens,features}/`)。

**2. `ai/` (27)**

| kind | 置き場所 |
|---|---|
| crosscutting / code-definitions / messages / i18n / infra-design / secrets-management / external-integration / test-plan / domain-overview / aggregate-map | `specs/shared/NN-*.md` (固定番号) |
| context-contract | `specs/<c>/contract.md` |
| api-spec / table-spec / domain-model / sequence-spec / state-machine / module-spec / job / test-spec | `specs/<c>/{api,tables,domain,sequences,state-machines,modules,jobs,tests}/` |
| tasks | `specs/tasks/` |
| guide / explanation / runbook | `handbook/{how-to,explanation,runbooks}/` |
| document-taxonomy / implementation-order / human-review / provenance-workflow | 利用 repo には置かない。`AGENTS.md` と docs/README.md から、版に固定した Igeta の手引きを指す (Igeta 自身では `templates/` にある) |

**3. `client/` (2)**: delivery-chapter → `delivery/<提出物名>/`、proposal → `proposals/<year>/NN-slug.md`

`tutorial` (予約済み、雛形なし) は 47 の外。登録するときは `ai/handbook/` に置く。
**4. 直下の決まり**: 文書を置ける場所は、上の表のパスと生成索引 (docs/ 直下の 2 本、各フォルダの README.md) だけ

**5. 15 本の上限の対象外**: `decisions/<year>/`・`proposals/<year>/` (1 本ずつ承認する記録)、`client/delivery/<提出物名>/`
(export が 1 冊に束ねる)

**6. 超えたときの分け方 (フォルダごとに 1 つ)**

| フォルダ | 超えたとき |
|---|---|
| `person/design/<c>/` の下と `ai/specs/<c>/` の下のフォルダ | まとまりを分ける合図。下位フォルダは足さない |
| `person/design/shared/` の固定の文書 (100 行超) | 行を、属するまとまりの `design/<c>/NN-<kind>.md` へ移す |
| `person/requirements/01-requirements.md` (150 行超) | まとまりごとに `requirements/NN-<c>.md` へ分ける |
| `ai/specs/tasks/`・`ai/handbook/` の 3 フォルダ | まとまりの下位フォルダ (`shared` を含む) へ全部移す。`shared` が 15 本を超えたら違反のまま |

## 却下した選択肢

- **置き場所の表を解説に置く**: 承認の要らない側に決めの本体が入る (round 2 の FIX-1)
- **person の全 kind に同じ型の検査を掛ける**: ID の行を持たない kind (地図・用語集・ADR など) が必ず落ちる
- **Igeta の手引きを利用 repo へ写す**: 写しが Igeta の版とずれ、承認の要らない側で書き換えられる

## Consequences

- 良い方向: 置き場所の決めが人の承認の下に 1 か所だけある。代償: 利用 repo の手引き 4 本は、移行で消してリンクに替える

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `Role.test.ts` | `ROLE_OF_KIND` と本表 (ガイド経由) | 47 kind の集合・置き場所・型の検査の区分が食い違う |
| `RoleBoundaryCheck` | 3 フォルダ配下 | 表に無い場所の文書を通す |

## 再検討トリガ

- kind が足されたら本表に行を足す (表に無い kind は `Role.test.ts` が落とす)
