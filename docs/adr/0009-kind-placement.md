---
id: adr-0009-kind-placement
title: ADR-0009 kind の置き場所の表は要件に置き、型の検査を掛ける kind を分ける
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-02
depends_on: [adr-0001-document-role-directories, adr-0004-folder-internal-structure-and-growth]
relates_to: [adr-0010-value-ownership, audience-directories]
---

# ADR-0009: kind の置き場所の表は要件に置き、型の検査を掛ける kind を分ける

> **TL;DR**: kind 47 種の置き場所の表は、ADR ではなく要件 ([要件定義書 02](../product/02-audience-directories.md) §7) に置く。
> 表は kind が増えるたびに直す「いまの決まり」で、ADR は書いた日の記録だから。表には、人の文書のうち型の検査を
> 掛ける kind (○)・図だけ (図)・掛けない (—) の区分を持たせる。Igeta の手引き 3 本は利用 repo に写さない

## 関連

- **上流 (depends_on)**: ADR-0001 (確定させる人で分ける) / ADR-0004 (まとまりと年で分ける、15 本)
- **下流**: [要件定義書 02](../product/02-audience-directories.md) §7 / `src/core/Role.ts` / 文書体系ガイド / ADR-0010

## Status

2026-10-02 提案。

## Context

置き場所の表を解説 (承認の要らない側) に置くと、承認の要らない文書が決めの正本になる。ADR に置くと、kind を
足すたびに記録を書き換えることになり、行数の上限も超える。また、人の文書のすべてに同じ型の検査を掛けると、
ID の行を持たない kind (地図・用語集・ADR など) が必ず落ちる。

## Decision Drivers

- 置き場所の決めは、人が承認する文書のうち「いまの決まり」に 1 か所だけ置く / 型の検査を掛ける kind を明示する

## Decision

1. **表の置き場所**: 要件定義書 02 §7。kind → 置き場所 → 型の検査の 1 表と、置ける場所・15 本の対象外・超えたときの
   分け方の決まり。文書体系ガイドと `Role.ts` はこの表の転記で、`TaxonomyGuideSync.test.ts` が 3 つを突き合わせる
2. **3 区分の数**: person 18・ai 27・client 2 の計 47 (`ARC42_BY_KIND` の全件)
3. **型の検査の区分**: ○ = 決まりの行を持つ kind (要件・全体共通の固定の文書・業務の決まり・画面)。
   図 = 地図 (図が本体)。— = 行に ID を持たない kind (用語集・機能ブリーフ・ADR・決定台帳)
4. **Igeta の手引き**: 文書体系ガイド・人の審査の手引き・由来の手順の 3 本は、Igeta の版ごとに決まる説明書なので、
   利用 repo に写さず、版に固定した手引きを指す。実装順序 (`implementation-order`) はプロジェクトが着手順を
   埋める文書なので、利用 repo の `ai/handbook/how-to/02-implementation-order.md` に置く
5. **15 本の対象外**: 日付の記録 (ADR・提案書) と提出物の章。どちらも束で読まず、1 本ずつ承認するか 1 冊に束ねる

## 却下した選択肢

- **表を解説に置く**: 承認の要らない側に決めの本体が入る
- **表を ADR に置く**: kind を足すたびに記録を書き換えることになり、100 行の上限も超える
- **person の全 kind に同じ型の検査を掛ける**: ID の行を持たない kind が必ず落ちる
- **Igeta の手引きを利用 repo へ写す**: 写しが Igeta の版とずれ、承認の要らない側で書き換えられる

## Consequences

- 良い方向: 置き場所の決めが、人が承認する「いまの決まり」に 1 か所だけある
- 代償: 利用 repo の手引き 3 本は、移行で消してリンクに替える (版の手引きと違う写しは止めて一覧に出す。ADR-0003)

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `TaxonomyGuideSync.test.ts` | 要件 02 §7・文書体系ガイド・`Role.ts` | 47 kind の集合・置き場所・型の検査の区分が 1 つでも食い違う |
| `RoleBoundaryCheck` | 3 フォルダ配下 | 表に無い場所の文書を通す |

## 再検討トリガ

- kind が足されたら、要件 02 §7 に行を足す (表に無い kind は `TaxonomyGuideSync.test.ts` が落とす)
