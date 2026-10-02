---
id: folder-placement
title: どの文書をどこに置くか — 木の図と、その理由
type: explanation
kind: explanation
status: active
canonical: false
owners: [eng]
created: 2026-10-01
depends_on: [adr-0009-kind-placement]
relates_to: [reader-granularity, context-boundaries]
---

# どの文書をどこに置くか — 木の図と、その理由

> **TL;DR**: ADR-0009 (kind 47 種の置き場所) を木の形に描いた図と、なぜこう分けるかの説明。決めの正本は
> ADR-0009・0004・0010 で、本書はその読み方の手引き。第 1 階層は確定させる人 (`person`/`ai`/`client`)、
> その下はまとまり (`context`) ごとのフォルダ、日付のある記録だけ年で分ける

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | ADR-0009 (kind の置き場所) | — |
| 下流 | (生成索引が出す) | — |

## 1. 木の図

```text
AGENTS.md                                  AI の入口 (person/ を上流、ai/ を持ち場として指す)
docs/
├── README.md / dependencies.md            生成索引
├── person/                                人が確定前に全部読んで承認する
│   ├── requirements/                      要件 (01-requirements.md + 追加の要件)
│   ├── design/
│   │   ├── shared/                        全体共通: 地図・機能一覧・方針と費用・品質・権限・データの扱い・用語 ほか
│   │   │   └── {flows,screens,features}/  どのまとまりにも属さない業務・画面・機能
│   │   └── <まとまり>/                    00-map.md と {flows,screens,features}/
│   └── decisions/                         01-decisions.md (決定台帳) と <year>/ (ADR)
├── ai/                                    AI が書き、評価する AI が確定させる
│   ├── specs/                             shared/・<まとまり>/ (contract.md・api・tables・domain…)・tasks/
│   └── handbook/                          how-to/・explanation/・runbooks/ (作業の手引き。決まりは書かない)
└── client/                                顧客と合意する: delivery/<提出物名>/・proposals/<year>/
```

## 2. なぜ「確定させる人」で分けるのか

読み手で分けると、人も AI も読む文書 (要件・業務の決まり・決定) の置き場所が決まらず、「両方」の場所が要る。
確定させる人で分けると、どの文書も答えが 1 つに決まる。人が承認しないと変えてはいけない決まりは `person/`、
AI だけで確定してよい作り方と手引きは `ai/`、顧客と合意するものは `client/`。置き場所が、そのまま承認の要否になる。

AI は `person/` も読む。人の決まりは AI にとっての上流で、AI はそれに従って `ai/` に作り方を書く。

## 3. なぜまとまりのフォルダにするのか

人も AI も、1 回の作業で読むのは「1 つのまとまり + 全体共通」に絞れる。フォルダがまとまりの単位になっていれば、
そのフォルダを開くだけで読むものが全部そろう。まとまりの中のフォルダが 15 本を超えるのは、まとまりが大きすぎる
合図で、下位フォルダを足すのではなく、まとまりを分ける。

## 4. なぜ ADR と提案書だけ年で分けるのか

ADR と提案書は、書いた日に意味がある記録で、後から動かさない。年で分ければ、置き場所が書いた時点で決まり、
リンクが切れない。いまの決まりは設計の文書の行にあり (ADR の番号を引く)、古い ADR を読み返す必要は無いので、
年のフォルダは何本あっても読む量は増えない。手順書や解説を年で分けても探す手がかりにならないので、年は使わない。

## 5. Igeta の手引きを写さない理由

文書体系ガイドなど Igeta が配る手引き 4 本は、Igeta の版ごとに決まっている。利用 repo に写すと、写しが版とずれ、
承認の要らない側で書き換えられる。利用 repo では写さず、版に固定した手引きを `AGENTS.md` と docs/README.md から指す。
