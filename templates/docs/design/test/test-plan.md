---
id: <kebab-slug>
title: テスト計画
type: design
kind: test-plan
arc42: 10
id_prefix: TSP
status: draft
canonical: true
owners: [eng]
created: YYYY-MM-DD
depends_on: [nonfunctional, function-list]
relates_to: [test-spec, operations]
---

<!--
  arc42 §10 Quality Requirements (品質要求) — arc42 公式の Content / Motivation / Form より訳出
  何を書く章か: 品質要求の全体像 (品質ツリー) と、測定可能な品質シナリオ。最重要のものは §1.2 に書いてあるので参照に留め、
    ここには「達成できなくても致命傷にならない」ものまで含めて広く書く。
  なぜ必要か: 品質要求はアーキテクチャ判断を大きく左右するため、具体的かつ測定可能な形で持つ必要がある。
  書かない方がよいもの: 「高速」「使いやすい」などの buzzword。数値と観測手段の無い品質要求は検証できない。
  出典: https://arc42.org/overview/ / https://docs.arc42.org/section-10/
-->

# テスト計画

> **TL;DR**: <何をどこまで検証したら出荷するかを 1 文で>
> - **正常系だけのテストは未完成**。否定テスト (権限・越境・競合) を階層ごとに必須にする
> - 緑であることと安全であることは別。壊れたテスト・書かれていないテストを定期的に探す

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [非機能要件](../basic/nonfunctional.md) / [機能一覧](../basic/function-list.md) | NFR-* / FN-* |
| 下流 | [テスト仕様](./specs/) / [運用設計](../ops/operations.md) | TST-* / OPS-* |

## 1. テストピラミッド

| 層 | 対象 | ツール | 実行タイミング | 目標カバレッジ | 必須の否定テスト |
|---|---|---|---|---|---|
| 単体 | domain / application | Vitest | 全 push | 80% | 状態遷移の不許可経路 |
| 結合 | infrastructure (実 DB) | Vitest + testcontainers | PR | — | 他テナント 0 行 / 制約違反 |
| 契約 | presentation ↔ OpenAPI | 生成型 | PR | — | 未定義フィールドの拒否 |
| E2E | 主要導線 | Playwright | PR / nightly | — | 越境 403 |

## 2. テスト環境

| ID | 環境 | データ | 外部サービス | 破棄方針 |
|---|---|---|---|---|
| TSP-001 | ローカル結合 | seed スクリプト | stub | 毎回破棄 |

## 3. Definition of Done

| 対象 | DoD |
|---|---|
| 1 ステップ完了 | 該当層のテスト緑 + カバレッジ 80% + `check:domain-drift` 緑 + `check:deps` 緑 |
| リリース可 | 全層緑 + 越境 403 の E2E + 監視閾値の設定済 |

## 4. 品質ゲートと例外

| ID | ゲート | 落ちたときの扱い | 例外を認める条件 |
|---|---|---|---|
| TSP-101 | カバレッジ 80% 未満 | マージ不可 | なし |

## 5. 性能・負荷テスト (任意)

| ID | シナリオ | 負荷 | 合格条件 |
|---|---|---|---|
