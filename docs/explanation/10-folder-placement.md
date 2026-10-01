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
relates_to: [context-boundaries, audience-directories]
---

# どの文書をどこに置き、増えたらどう分けるか

> **TL;DR**: フォルダ木の正本 (§1) と、kind 47 種すべての置き場所 (§3)。第1階層は承認者 (`person`/`ai`/`client`)、
> その下は**まとまり (`context`) ごとのフォルダ**。人は自分のまとまりのフォルダと全体共通 (`shared`) だけを
> 開けば、読んで決めるものが全部そろう。決定の記録と提案書は年で分ける。1 フォルダ 15 本を超えたら違反

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [人が読んで決める文書の型と量](./09-reader-granularity.md) | — |
| 下流 | ADR-0001 / ADR-0004 / `src/core/Role.ts` / `src/checks/FolderSizeCheck.ts` | — |

## 1. 全体のフォルダ木 (正本)

```text
AGENTS.md                              AI の入口
docs/
├── README.md / dependencies.md        生成索引 (直下に置けるのはこの 2 つだけ)
├── person/                            人が読んで決める
│   ├── requirements/NN-slug.md        要件
│   ├── design/
│   │   ├── shared/                    全体共通 (context 無記入の文書)
│   │   │   ├── 00-map.md              全体の地図 (人の入口)
│   │   │   └── NN-<kind>.md           機能一覧・方針と費用・品質の目標・権限・データの扱い・用語 ほか
│   │   └── <context>/                 まとまりごと
│   │       ├── 00-map.md              まとまりの地図
│   │       ├── flows/NN-slug.md       業務の決まり
│   │       ├── screens/NN-slug.md     画面と流れ
│   │       └── features/NN-slug.md    機能ブリーフ
│   ├── decisions/
│   │   ├── 01-decisions.md            決定台帳 (仮・未決の一覧を生成)
│   │   └── <year>/NNNN-slug.md        決定の記録 (ADR)
│   └── handbook/
│       ├── how-to/NN-slug.md          手引き (文書体系ガイドを含む)
│       ├── explanation/NN-slug.md     解説
│       └── runbooks/NN-slug.md        人が作業する手順
├── ai/specs/                          AI が書いて AI が使う
│   ├── shared/NN-<kind>.md            横断の決まり・区分値・文言・基盤の構成・ドメインの全体 ほか
│   ├── <context>/
│   │   ├── contract.md                他のまとまりへの約束
│   │   └── {api,tables,domain,sequences,state-machines,modules,jobs,tests}/NN-slug.md
│   └── tasks/NN-slug.md               実装タスク
└── client/                            顧客と合意する
    ├── delivery/<提出物名>/            提出物の章と付属ファイル
    └── proposals/<year>/NN-slug.md    提案書
```

## 2. 下位フォルダを決める原理

| 文書の性質 | 分ける鍵 | 理由 |
|---|---|---|
| いまの決まり・作り方 (常に最新を保つ) | **まとまり (`context`)** | 人も AI も「1 つのまとまりだけ読めば作業できる」。フォルダが読む単位になる |
| 日付のある記録 (ADR・提案書) | **年** | 書いた時点で決まり、後から変わらない。動かさないのでリンクが切れない |
| 人が作業する手順・解説 | 種類 (how-to / explanation / runbooks)。15 本を超えたら主題 (`context`) | 作業のときに探すので種類で引く |

`context` はフィールド (frontmatter) とフォルダ名の両方に書き、食い違ったら違反にする。これは
[まとまりの境界](./07-context-boundaries.md) §2 の「まとまりはフォルダで表さない」を改める (実装時に 07 を改訂)。
改める理由: 人が読む量の上限を、フォルダの単位で測って守るため。

## 3. kind 47 種の置き場所

振り分けの問いは 1 つ: 「AI が勝手に変えたら、事業・お金・顧客との約束・使う人の体験・法令が変わるか」。

### `person/` — いまの決まり (16 kind)

| kind | 置き場所 | 人が決める理由 |
|---|---|---|
| map | `person/design/shared/00-map.md` | 何を作り、何を作らないか |
| context-map | `person/design/<context>/00-map.md` | まとまりの範囲 |
| requirements | `person/requirements/` | 満たすべきことと受入条件 |
| function-list / solution-strategy / nonfunctional | `person/design/shared/` (固定番号) | 作る範囲、使う技術と費用、品質の目標 |
| permission-matrix / data-management / glossary | `person/design/shared/` (固定番号) | 誰が何をできるか、持つデータと個人情報、顧客と合わせた言葉 |
| as-is-overview / risks-tech-debt | `person/design/shared/` (固定番号) | 現状の理解、受け入れるリスク |
| operations / migration-plan | `person/design/shared/` (固定番号) | 人が行う運用、利用者に影響する移行 |
| business-flow | `person/design/<context>/flows/` | 業務の決まり (期限・金額・例外のときどうするか) |
| screen-spec | `person/design/<context>/screens/` | どんな画面があり、どう流れるか |
| feature-brief | `person/design/<context>/features/` | 機能の目的と優先順位 |

### `person/` — 決定の記録と手引き (9 kind)

| kind | 置き場所 | 読む時 |
|---|---|---|
| adr | `person/decisions/<year>/` | 決めるその時に 1 本を読んで承認する |
| decision-log | `person/decisions/01-decisions.md` | 仮・未決の一覧を見て決める |
| guide / explanation / runbook | `person/handbook/{how-to,explanation,runbooks}/` | その作業をする人が、作業の前に読む |
| document-taxonomy / implementation-order / human-review / provenance-workflow | `person/handbook/how-to/01〜04` (固定番号) | 同上 |

### `ai/` (20 kind)

| kind | 置き場所 | AI に任せる理由 |
|---|---|---|
| crosscutting / code-definitions / messages / i18n | `ai/specs/shared/` (固定番号) | 作り方の横断の決まり |
| infra-design / secrets-management / external-integration / test-plan | `ai/specs/shared/` (固定番号) | 構成の細部と検証の手順。選定と費用は人の solution-strategy が決める |
| domain-overview / aggregate-map | `ai/specs/shared/` (固定番号) | 内部の構造 |
| context-contract | `ai/specs/<context>/contract.md` | まとまりの間の技術的な約束 |
| api-spec / table-spec / domain-model / sequence-spec | `ai/specs/<context>/{api,tables,domain,sequences}/` | 内部の設計 |
| state-machine / module-spec / job / test-spec | `ai/specs/<context>/{state-machines,modules,jobs,tests}/` | 内部の設計 |
| tasks | `ai/specs/tasks/` | 実装の段取り |

### `client/` (2 kind)

| kind | 置き場所 |
|---|---|
| delivery-chapter | `client/delivery/<提出物名>/` |
| proposal | `client/proposals/<year>/` |

**計 16 + 9 (person) + 20 (ai) + 2 (client) = 47 kind。** `ARC42_BY_KIND` (`src/checks/DocTemplateCheck.ts`) の全件。
`index` は生成物で数えない。`tutorial` は予約済みでテンプレ未実装のため 47 の外。登録するときは `person/handbook/` に置く。

画面の項目の型や入力チェックの細目、表の列の定義は文書にしない。コードが正本で、コードから導ける
([解決戦略](../design/basic/02-solution-strategy.md) の「コードから導けることは書かない」)。業務に効く決まり
(例: 緊急連絡先は必須) は、`person/` の決まりの表に 1 行で書く。

## 4. 直下の決まりと本数の上限

- **直下に文書を置けるか**は §1 の木と §3 の表だけで決まる。木に無い場所 (例: `docs/person/` の直下、
  `design/` の直下) に文書を置いたら違反。そこに置けるのは生成索引 (README.md) だけ
- **1 フォルダ 15 本を超えたら違反** (新レイアウトの repo)。実測では、問題の起きたフォルダは 16〜35 本、
  問題の無い repo は最大 10 本だった。15 はその間の値
- 超えたときの分け方は 1 つに固定する。`flows/` などまとまりの中のフォルダが超えたら、**まとまりを分ける**
  合図として扱う (下位フォルダを足さない)。`handbook/` の 3 フォルダは主題 (`context`) の下位フォルダへ全部移す。
  `decisions/<year>/` は年で既に分かれている

## 5. 限界

- まとまりの分け方・統合の手順 (境界を引き直す) はまだ設計していない。15 本と量の上限が「分ける合図」を出すところまで
- この表は、実装時に文書体系ガイド §2 へ転記し、正典をガイドの 1 か所にする (それまでは本書が正本)
