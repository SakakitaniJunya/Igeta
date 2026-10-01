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

> **TL;DR**: 全体のフォルダ木 (正本、§1)。「1 文書の単位」([粒度](./09-reader-granularity.md) §2) が決まれば
> 下位フォルダの鍵が決まる、という1つの原理 (§2) から、kind 47 種全部の置き場所を導く (§3)。直下に置けるのは
> 生成索引と入口文書だけ、15 本を超えたら違反 (§4)

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [人とAIと顧客で、なぜ・どう書き分けるか](./09-reader-granularity.md) | — |
| 下流 | ADR-0001/0004 / `src/core/Role.ts` / `src/checks/FolderSizeCheck.ts` | — |

## 1. 全体のフォルダ木 (正本)

```text
docs/
├── common/
│   ├── decisions/<year>/NNNN-slug.md      (adr、年で分ける)
│   ├── how-to/{01-document-taxonomy,02-implementation-order,03-human-review,04-provenance-workflow,NN-slug}.md
│   ├── runbooks/NN-slug.md
│   ├── proposal/<year>/NN-slug.md
│   ├── explanation/NN-slug.md
│   ├── contexts/contracts/<context>.md
│   └── architecture/02-glossary.md
├── ai/specs/
│   ├── product/01-requirements.md
│   └── design/{basic,detail,test,ops,tasks}/...・architecture/{01-overview,02-external-integration}.md
├── person/guides/
│   ├── 00-map.md
│   ├── 01-decisions.md
│   ├── contexts/maps/<context>.md
│   └── features/NN-slug.md
└── client/delivery/<提出物名>/...
```

## 2. 単位が下位フォルダの鍵を決める (1つの原理)

[粒度](./09-reader-granularity.md) §2 の「1 文書の単位」が決まれば、分け方は自動的に決まる。

| 読み手 | 単位 | 鍵 |
|---|---|---|
| AI | 画面/API資源/テーブル/集約 1 つ | 単位が最初から多いと分かっているため `context` で最初から分ける |
| 人 | 問い 1 つ | `map`/`context-map`/`decision-log` は既に1ファイル=1単位 (分割不要)。`feature-brief` は機能数だけ増えるため `context`+15本閾値の対象 |
| 顧客 | 業務トピック 1 つ=章 1 | 提出物ごとに既にフォルダが分かれている (`delivery/<提出物名>/`)。分割不要 |
| 共通 | 決定/提案 1 つ (ADR・proposal) | 単位は増え続け一度書いたら変わらないため、書いた時点で決まる**年**で束ねる |
| 共通 | 手順/解説 1 つ (runbook・how-to・explanation) | 年には主題上の意味が無い (CEO指摘「脳死」)。**`context`** (業務のまとまりだけでなく「運用する仕組み・主題」にも意味を広げる) |

**15本を超えたときの実際の形**: 「一部だけ下位フォルダへ」は許さない。**超えたら全部を下位フォルダへ移し、
直下は README.md だけにする** (半端な状態を作らない)。例: `common/runbooks/<context>/NN-slug.md`、
`person/guides/features/<context>/NN-slug.md`。`context` 無記入 (`shared`) の文書も例外にせず、文字列
`shared` を 1 つの `context` 値として扱い `common/runbooks/shared/NN-slug.md` のように同じ規則で分ける。

## 3. kind 47 種の置き場所

### AI (31 kind)

| kind | 置き場所 | 直下可否 | 鍵 |
|---|---|---|---|
| requirements | `ai/specs/product/01-requirements.md` | 固定1本 | — |
| function-list/solution-strategy/nonfunctional | `ai/specs/design/basic/01〜03.md`(固定) | 固定1本 | — |
| crosscutting/code-definitions/messages | `.../design/basic/04〜06.md`(固定) | 固定1本 | — |
| permission-matrix/infra-design/i18n | `.../design/basic/07〜09.md`(固定) | 固定1本 | — |
| data-management/secrets-management (テンプレ未実装・予約) | 同上予定 | 固定1本 | — |
| business-flow/screen-spec/api-spec/table-spec | `.../design/basic/{flows,screens,api,tables}/` | 不可(常にサブフォルダ) | `context` |
| domain-overview/aggregate-map | `.../design/detail/domain/01,02`(固定) | 固定1本 | — |
| domain-model/sequence-spec/state-machine/module-spec | `.../design/detail/{domain,sequences,state-machines,modules}/` | 不可 | `context` |
| job/test-spec/tasks | `.../design/{detail/jobs,test/specs,tasks}/` | 可(15本超で分割) | `context` |
| test-plan/risks-tech-debt | `.../design/{test/01-test-plan,01-risks-tech-debt}.md` | 固定1本 | — |
| operations/migration-plan | `.../design/ops/01,02.md`(固定) | 固定1本 | — |
| as-is-overview/external-integration | `ai/specs/architecture/` | 固定1本ずつ | — |

(12 行・31 kind)

### common (11 kind)

| kind | 置き場所 | 直下可否 | 鍵 |
|---|---|---|---|
| glossary | `common/architecture/02-glossary.md` | 固定1本 | — |
| adr | `common/decisions/<year>/` | 不可(常に年) | **年** |
| proposal | `common/proposal/` | 可(15本超) | **年** |
| guide(how-to)/runbook/explanation | `common/{how-to,runbooks,explanation}/` | 可(15本超) | `context` |
| implementation-order/document-taxonomy/human-review/provenance-workflow | `common/how-to/01〜04`(固定番号) | 固定1本ずつ | — |
| context-contract | `common/contexts/contracts/` | 不可 | `context`(自身が単位) |

(6 行・11 kind)

### person (4 kind)

| kind | 置き場所 | 直下可否 | 鍵 |
|---|---|---|---|
| map/decision-log | `person/guides/{00-map,01-decisions}.md` | 固定1本・直下許容 | — |
| context-map | `person/guides/contexts/maps/` | 不可 | `context` |
| feature-brief | `person/guides/features/` | 可(15本超で分割) | `context` |

(3 行・4 kind)

### client (1 kind)

| kind | 置き場所 | 直下可否 | 鍵 |
|---|---|---|---|
| delivery-chapter | `client/delivery/<提出物名>/` | 不可(常に提出物名) | 提出物名(既存) |

(1 行・1 kind)

**計 31 (ai) + 11 (common) + 4 (person) + 1 (client) = 47 kind。** `ARC42_BY_KIND`(`src/checks/DocTemplateCheck.ts`)
の全件と一致 (`index` は生成物で kind 登録の対象外、本数に含めない)。

**`tutorial`(文書体系ガイドで予約済み、Diátaxis の tutorial)**: `common/` 配下。テンプレ未実装、`ARC42_BY_KIND`
未登録のため上記 47 の数え合わせの**外**に置く (登録されたら 48 になる)。

## 4. 直下ファイルの決まりと 15 本の上限

**直下に文書を置けるかどうかは、kind ごとの全数表 (§3) の「直下可否」列だけで決まる。表に無い置き方は違反**
(個別のフォルダ列挙はしない。`common/` の 7 フォルダを含め全フォルダに同じ 1 つの根拠が当てはまる)。
例: `person/guides/` 直下は `map`/`decision-log` の「固定1本・直下許容」により `00-map.md`・`01-decisions.md`
が置ける。`ai/specs/` 直下は表に「直下許容」の行が無いため、生成索引 (README.md) 以外は違反。

閾値は1フォルダ**15本**で違反 (新レイアウトの repo、既定強制)。根拠 (director 実測): 利用 repo A は最大10本
(無害)、利用 repo B は design 配下1フォルダ33本・業務文書1フォルダ16本、旧社内 repo は ADR35・guides26・
runbooks21本。15 は全ての既知の痛みを捉え、無害な実例を誤検知しない最小値。

## 5. 限界

- `context` フィールドの意味を「業務のまとまり」から「運用する仕組み・主題」へ広げた。既存の説明 (context-boundaries.md §1) への追記が実装時に要る
- kind 全数表は、実装時に文書体系ガイド §2 へ転記し、正典をガイドの 1 か所にする (それまでは本書が置き場所の正本)
