---
id: <kebab-slug>
title: 非機能要件
type: design
kind: nonfunctional
arc42: 10
id_prefix: NFR
status: draft
canonical: true
owners: [eng]
created: YYYY-MM-DD
depends_on: [requirements]
relates_to: [infra-design, operations, test-plan]
---

<!--
  arc42 §10 Quality Requirements (品質要求) — arc42 公式の Content / Motivation / Form より訳出
  何を書く章か: 品質要求の全体像 (品質ツリー) と、測定可能な品質シナリオ。最重要のものは §1.2 に書いてあるので参照に留め、
    ここには「達成できなくても致命傷にならない」ものまで含めて広く書く。
  なぜ必要か: 品質要求はアーキテクチャ判断を大きく左右するため、具体的かつ測定可能な形で持つ必要がある。
  書かない方がよいもの: 「高速」「使いやすい」などの buzzword。数値と観測手段の無い品質要求は検証できない。
  出典: https://arc42.org/overview/ / https://docs.arc42.org/section-10/
-->

# 非機能要件

> **TL;DR**: <守る水準を 1 文で>
> - 数値は**測定方法とセット**で書く。測れない目標は目標でない
> - 仮置きの値は「未確認」と明記し、確定条件を書く

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [要件定義書](../../product/01-requirements.md) | REQ-* |
| 下流 | [インフラ設計](./08-infra-design.md) / [運用設計](../ops/01-operations.md) / [テスト計画](../test/01-test-plan.md) | INF-* / OPS-* / TST-* |

## 1. 性能

| ID | 指標 | 目標値 | 測定方法 | 根拠 | 確度 |
|---|---|---|---|---|---|
| NFR-001 | API p95 応答 | 200ms 未満 | Cloud Monitoring | | 仮置き |

## 2. 可用性

| ID | 指標 | 目標 | 計画停止の扱い | 未達時の対応 |
|---|---|---|---|---|
| NFR-101 | 月間稼働率 | 99.5% | 事前告知で除外 | |

## 3. セキュリティ

| ID | 要件 | 実装手段 | 検証方法 |
|---|---|---|---|
| NFR-201 | テナント越境の遮断 | RLS + 認可 Guard | 越境 E2E で 403 / 他テナント 0 行 |

## 4. 運用・監視閾値

<!-- 閾値は「誰が何分以内に何をするか」まで決めて初めて意味を持つ -->

| ID | 監視項目 | 閾値 | 通知先 | 一次対応 |
|---|---|---|---|---|
| NFR-301 | 5xx 率 | 5 分平均 1% 超 | Discord | ロールバック判断 |

## 5. 多言語・表示

| ID | 対象 | 言語 | フォールバック | 機械翻訳の可否 |
|---|---|---|---|---|
| NFR-401 | 顧客 UI | ja | — | 規定文は不可 |

## 6. データ保護・法令 (任意)

| ID | 要件 | 根拠法令/規約 | 実装手段 |
|---|---|---|---|
