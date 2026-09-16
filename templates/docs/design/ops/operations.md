---
id: <kebab-slug>
title: 運用設計
type: design
kind: operations
arc42: 7
id_prefix: OPS
status: draft
canonical: true
owners: [eng]
created: YYYY-MM-DD
depends_on: [nonfunctional, infra-design]
relates_to: [migration-plan, test-plan]
---

<!--
  arc42 §7 Deployment View (配置ビュー) — arc42 公式の Content / Motivation / Form より訳出
  何を書く章か: 実行環境 (地理・環境・機器・ネットワーク経路) と、ソフトウェア構成要素のそこへの割り当て。
    開発 / テスト / 本番など環境が複数あるなら、関係するものはすべて書く。
  なぜ必要か: ソフトウェアはハードウェア無しには動かず、インフラは横断概念 (§8) にも影響するため。
  書かない方がよいもの: 配置の説明に不要なインフラ詳細。構成要素の配置を示すのに必要な範囲で足りる。
  出典: https://arc42.org/overview/ / https://docs.arc42.org/section-7/
-->

# 運用設計

> **TL;DR**: <運用の方針を 1 文で>
> - 本書は**方針**。実際の手順書は稼働後に `docs/runbooks/<scenario>.md` (100 行以下) へ切り出す
> - 監視は「閾値 → 通知先 → 一次対応」まで決めて初めて監視になる

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [非機能要件](../basic/nonfunctional.md) / [インフラ設計](../basic/infra-design.md) | NFR-* / INF-* |
| 下流 | `docs/runbooks/` / [ジョブ仕様](../detail/jobs/) / [移行・リリース計画](./migration-plan.md) | MIG-* |

## 1. バックアップ・復旧

| ID | 対象 | 方式 | 頻度 | 保持 | RPO / RTO | 復旧試験 |
|---|---|---|---|---|---|---|
| OPS-001 | Cloud SQL | 自動バックアップ + PITR | 日次 | 7 日 | / | 四半期 |

## 2. 監視・アラート

| ID | 監視項目 | 閾値 | 通知先 | 一次対応 | 対応 NFR |
|---|---|---|---|---|---|
| OPS-101 | 5xx 率 | 5 分平均 1% | Discord | ロールバック判断 | NFR-301 |

## 3. 障害対応

| ID | 事象 | 影響 | 切り分け手順 | 復旧手段 | エスカレーション |
|---|---|---|---|---|---|
| OPS-201 | API 全断 | 予約不可 | | 直前 revision へ切戻し | |

## 4. デプロイ手順

<!-- 順序と検証を書く。「deploy 成功」は「配信されている」ではない -->

| ID | 手順 | 実行者 | 検証 | 失敗時 |
|---|---|---|---|---|
| OPS-301 | migration (Cloud Run Job) | CI | 終了コード 0 | 中止 |
| OPS-302 | api → web の順で deploy | CI | 新 revision に curl で実測 | traffic を戻す |

## 5. 定期作業

| ID | 作業 | 頻度 | 自動/手動 | 担当 |
|---|---|---|---|---|

## 6. ログ・監査 (任意)

| ID | 種別 | 保持期間 | 個人情報のマスキング |
|---|---|---|---|
