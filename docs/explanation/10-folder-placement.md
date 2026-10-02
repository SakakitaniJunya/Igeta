---
id: folder-placement
title: どの文書をどこに置き、増えたらどう分けるか
type: explanation
kind: explanation
status: active
canonical: true
owners: [eng]
created: 2026-10-01
depends_on: [reader-granularity]
relates_to: [template-realignment, context-boundaries, audience-directories]
---

# どの文書をどこに置き、増えたらどう分けるか

> **TL;DR**: フォルダ木の正本 (§1) と kind 47 種すべての置き場所 (§3)。第 1 階層は確定させる人
> (`person`/`ai`/`client`)、その下はまとまり (`context`) ごとのフォルダ。`person/` には人が確定前に全部読む
> 文書だけを置き、手順書・解説は `ai/handbook/` に置く。1 フォルダ 15 本を超えたら違反で、分け方はフォルダごとに 1 つ

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [人が読んで決める文書の型と量](./09-reader-granularity.md) | — |
| 下流 | [雛形の組み直し](./11-template-realignment.md) / ADR-0001 / ADR-0004 / `src/core/Role.ts` | — |

## 1. 全体のフォルダ木 (正本)

```text
AGENTS.md                                  AI の入口 (person/ を上流、ai/ を持ち場として指す)
docs/
├── README.md / dependencies.md            生成索引 (docs/ 直下に置けるのはこの 2 つだけ)
├── person/                                人が確定前に全部読んで承認する
│   ├── requirements/01-requirements.md    要件 (150 行を超えたら <context>.md に分ける)
│   ├── design/
│   │   ├── shared/                        全体共通 (context 無記入 = shared)
│   │   │   ├── 00-map.md                  全体の地図
│   │   │   ├── NN-<kind>.md               機能一覧・方針と費用・品質の目標・権限・データの扱い・用語 ほか
│   │   │   └── {flows,screens,features}/NN-slug.md   どのまとまりにも属さない業務・画面・機能
│   │   └── <context>/
│   │       ├── 00-map.md                  まとまりの地図
│   │       ├── {flows,screens,features}/NN-slug.md
│   │       └── NN-<kind>.md               shared の固定の文書を分けた先 (§4)
│   └── decisions/
│       ├── 01-decisions.md                決定台帳 (仮・未決の一覧は生成)
│       └── <year>/NNNN-slug.md            決定の記録 (ADR)
├── ai/                                    AI が書き、評価する AI が確定させる
│   ├── specs/
│   │   ├── shared/NN-<kind>.md, {api,tables,domain,…}/NN-slug.md
│   │   ├── <context>/contract.md          他のまとまりへの約束
│   │   ├── <context>/{api,tables,domain,sequences,state-machines,modules,jobs,tests}/NN-slug.md
│   │   └── tasks/NN-slug.md               実装タスク
│   └── handbook/
│       ├── how-to/01〜04-*.md, NN-slug.md Igeta の手引き 4 本 + 作業の手引き
│       ├── explanation/NN-slug.md         調査・背景
│       └── runbooks/NN-slug.md            運用と障害の手順
└── client/
    ├── delivery/<提出物名>/                提出物の章と付属ファイル
    └── proposals/<year>/NN-slug.md        提案書
```

## 2. 下位フォルダを決める原理

| 文書の性質 | 分ける鍵 | 理由 |
|---|---|---|
| いまの決まり・作り方 (常に最新を保つ) | まとまり (`context`) | 1 つのまとまりだけ読めば作業できる。フォルダが読む単位になる |
| 日付のある記録 (ADR・提案書) | 年 | 書いた時点で決まり、後から動かさない。リンクが切れない |
| 手引き (how-to・解説・手順書) | 種類。15 本を超えたらまとまり | 作業のときに種類で探す |

`context` の意味は「業務のまとまり」1 つだけ。主題 (デプロイ、監視など) には使わない。主題の手引きは `shared`。
`context` はフィールドとフォルダ名の両方に書き、食い違ったら違反。

## 3. kind 47 種の置き場所

振り分けの問いは 1 つ:「AI が勝手に変えたら、事業・お金・顧客との約束・使う人の体験・法令が変わるか」。
`ai/` の kind は、雛形の全部の節がこの問いに「変わらない」と答える形に組み直す ([雛形の組み直し](./11-template-realignment.md))。

**`person/` (18 kind)**

| kind | 置き場所 | 人が決めること |
|---|---|---|
| map / context-map | `design/shared/00-map.md` / `design/<context>/00-map.md` | 何を作り、何を作らないか |
| requirements | `requirements/` | 満たすべきことと受入条件 |
| function-list / solution-strategy | `design/shared/` (固定番号) | 作る範囲 / 使う技術と費用の上限 |
| nonfunctional / permission-matrix | `design/shared/` (固定番号) | 品質の目標と対応する言語 / 誰が何をできるか |
| data-management / glossary | `design/shared/` (固定番号) | 持つデータ・保持期間・越境 / 顧客と合わせた言葉 |
| as-is-overview / risks-tech-debt | `design/shared/` (固定番号) | 現状の理解と外部との契約 / 受け入れるリスク |
| operations / migration-plan | `design/shared/` (固定番号) | 復旧の目標と人の役割 / リリースの段階と切戻しの条件 |
| business-flow / screen-spec / feature-brief | `design/<context>/{flows,screens,features}/` | 業務の決まり / 画面と流れ / 機能の目的と優先順位 |
| adr / decision-log | `decisions/<year>/` / `decisions/01-decisions.md` | 決定とその理由 / 仮・未決の片づけ |

**`ai/` (27 kind)**

| kind | 置き場所 |
|---|---|
| crosscutting / code-definitions / messages / i18n | `specs/shared/` (固定番号) |
| infra-design / secrets-management / external-integration / test-plan | `specs/shared/` (固定番号) |
| domain-overview / aggregate-map | `specs/shared/` (固定番号) |
| context-contract | `specs/<context>/contract.md` |
| api-spec / table-spec / domain-model / sequence-spec | `specs/<context>/{api,tables,domain,sequences}/` |
| state-machine / module-spec / job / test-spec | `specs/<context>/{state-machines,modules,jobs,tests}/` |
| tasks | `specs/tasks/` |
| guide / explanation / runbook | `handbook/{how-to,explanation,runbooks}/` |
| document-taxonomy / implementation-order / human-review / provenance-workflow | `handbook/how-to/01〜04` (固定番号) |

**`client/` (2 kind)**: delivery-chapter → `delivery/<提出物名>/`、proposal → `proposals/<year>/`

**計 18 (person) + 27 (ai) + 2 (client) = 47 kind。** `ARC42_BY_KIND` (`src/checks/DocTemplateCheck.ts`) の全件。
`index` は生成物で数えない。`tutorial` は予約済みでテンプレ未実装のため 47 の外。登録するときは `ai/handbook/` に置く。

画面の項目・入力チェック・表の列の定義は、新しく文書にしない (コードが正本)。業務に効く決まり
(例: 緊急連絡先は必須) は、`person/` の決まりの表に 1 行で書く。既存の文書を移すときは、削る詳細を捨てずに
`ai/` の同じまとまりへ移す (ADR-0003)。

## 4. 直下の決まりと、増えたときの分け方

- 直下に文書を置けるかは §1 の木だけで決まる。木に無い場所 (例: `docs/person/` の直下) に置いたら違反
- **1 フォルダ 15 本を超えたら違反** (新しい構成の repo)。実測では、問題の起きたフォルダは 16〜35 本、
  問題の無い repo は最大 10 本だった。15 はその間の値
- 日付のある記録のフォルダ (`decisions/<year>/`・`proposals/<year>/`) は 15 本の対象外。束で読まず、
  1 本ずつ承認する記録だから。いまの決まりは設計の文書にあり、古い ADR を読み返す必要はない
- 超えたときの分け方は、フォルダごとに 1 つ

| フォルダ | 超えたとき |
|---|---|
| `design/<context>/{flows,screens,features}/` | まとまりを分ける合図。下位フォルダは足さない |
| `design/shared/` の固定の文書 (100 行超) | 行を、その行が属するまとまりの `design/<context>/NN-<kind>.md` へ移す。どこにも属さない行だけ残す |
| `requirements/01-requirements.md` (150 行超) | まとまりごとに `requirements/<context>.md` へ分ける |
| `ai/specs/tasks/`・`ai/handbook/` の 3 フォルダ | まとまりごとの下位フォルダ (`shared` を含む) へ全部移す。`shared` がまだ 15 本を超えたら違反のまま (束ねるか退役させる) |

## 5. 限界

- まとまりの分け方・統合の手順 (境界を引き直す) はまだ設計していない。15 本と量の上限が「分ける合図」を出すところまで
- この表は、実装時に文書体系ガイド §2 へ転記し、正典をガイドの 1 か所にする (それまでは本書が正本)
