---
id: <kebab-slug>            # 例: risks-tech-debt
title: リスクと技術的負債
type: design
kind: risks-tech-debt
arc42: 11
id_prefix: RSK
status: draft
canonical: true
owners: [eng]
created: YYYY-MM-DD
depends_on: [solution-strategy]
relates_to: [nonfunctional, migration-plan]
---

<!--
  arc42 §11 Risks and Technical Debt (リスクと技術的負債) — arc42 公式の Contents / Motivation / Form より訳出
  何を書く章か: 認識している技術リスクと技術的負債を優先度順に並べた一覧と、低減・回避・返済の手段。
  なぜ必要か: 「リスク管理とは大人のプロジェクト管理である」(Tim Lister)。PM や PO がリスク分析と対策計画に使う。
  書かない方がよいもの: 課題管理台帳そのもの。期日・担当・進捗は課題管理ツールが正典で、本書は設計への影響だけを持つ。
  出典: https://arc42.org/overview/ / https://docs.arc42.org/section-11/
-->

# リスクと技術的負債

> **TL;DR**: <この設計が抱えるリスクと負債を 1 文で>
> - **台帳の SoT は Plane (課題管理)**。本書は「設計上どう効くか」の要約とリンクだけを持つ
> - 期日と担当を本書に書き写さない。二重管理した台帳は必ず腐る (原則: サイレント縮退禁止)

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [解決戦略](./basic/02-solution-strategy.md) / [非機能要件](./basic/03-nonfunctional.md) | SS-* / NFR-* |
| 下流 | [移行・リリース計画](./ops/02-migration-plan.md) / Plane issue | MIG-* |

## 1. 技術リスク

<!-- 確率 × 影響 は高 / 中 / 低 の 3 段階。早期兆候 = 「顕在化する前に観測できるもの」。無いなら「無し」と書く -->

| ID | リスク | 確率 | 影響 | 早期兆候 | 対応 (低減 / 回避 / 受容) | Plane |
|---|---|---|---|---|---|---|
| RSK-001 | | | | | | |

## 2. 技術的負債

<!-- 「意図して先送りしたもの」だけを書く。知らずに積んだものは負債ではなく欠陥 (→ 直す) -->

| ID | 内容 | 負債を負った理由 | 返済条件 (何が起きたら返す) | 決定元 ADR |
|---|---|---|---|---|
| RSK-101 | | | | |

## 3. 受容したリスク (任意)

<!-- 「対応しない」と決めたものを明示する。書かないと、後から誰かが黙って対応を始める -->

| ID | リスク | 受容の理由 | 再評価のトリガ |
|---|---|---|---|
| RSK-201 | | | |
