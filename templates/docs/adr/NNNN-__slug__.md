---
id: <kebab-slug>            # 例: modular-monolith
title: ADR-NNNN <決定の要約>
type: adr
kind: adr
arc42: 9
status: proposed           # proposed | accepted | amended | superseded | rejected
canonical: true
owners: [eng]
created: YYYY-MM-DD
depends_on: []
relates_to: []
---

<!--
  arc42 §9 Architecture Decisions (アーキテクチャ決定) — arc42 公式の Contents / Motivation / Form より訳出
  何を書く章か: 重要・高コスト・大規模・リスク の高い決定と、その根拠。「複数案から基準に沿って 1 つ選ぶ」ことを決定と呼ぶ。
  なぜ必要か: 関係者が決定を後から追跡・理解できるようにするため。
  書かない方がよいもの: §4 (解決戦略) と同じ説明の重複。形式は ADR を推奨、と arc42 自身が挙げている。
  出典: https://arc42.org/overview/ / https://docs.arc42.org/section-9/
-->

# ADR-NNNN: <決定の要約>

> **TL;DR**: <決定を 1 文で>
> - <最重要の制約または帰結>
> - <2 番目に重要なもの>
> - <これが置き換える/却下するもの>

## 関連

<!-- ADR は 150 行上限が厳しいので箇条書き形式でよい (表でも可) -->

- **上流 (depends_on)**: <この決定の前提になる ADR / 設計書>
- **下流**: <この決定に従う設計書・実装・CI>

## Status

<!-- 日付 + 決定者 + 決定 ID (DEC-YYYYMMDD-nn)。amend したら旧内容は履歴として残す -->

## Context

<!-- 5 行以内。長くなるなら別文書へリンクする -->

## Decision Drivers

<!-- 判断軸。ここに無い理由で決めたなら軸が漏れている。MADR の Decision Drivers に相当 -->

- <軸 1 (最優先)>
- <軸 2>
- <軸 3>

## Decision

**採用: <案>**。理由: <1 行>。

<!-- 詳細は表で書く。判断軸 → 採用 → 理由 の順 -->

## 却下した選択肢

<!-- 1 案 2 行以内。採用案より長く書かない -->

## Consequences

<!-- 良い方向 / 代償 を対で書く。代償が書かれていない ADR は検討が足りていない -->

## Confirmation

<!--
  この決定が守られていることを**どう確かめるか**。CI スクリプト名 / lint ルール / レビュー観点を書く。
  手段が無いなら「未整備」と書く。無いものを書かない (原則: 無いものを書かない)。MADR の Confirmation に相当。
-->

| 手段 | 対象 | 落ちる条件 |
|---|---|---|

## 再検討トリガ

<!-- 「どうなったらこの決定を見直すか」を観測可能な条件で -->
