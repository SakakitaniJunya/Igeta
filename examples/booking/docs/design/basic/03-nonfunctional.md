---
id: sample-nonfunctional
title: 予約 CLI サンプルの非機能要件
type: design
kind: nonfunctional
arc42: 10
id_prefix: NFR
status: draft
canonical: true
owners: [eng]
created: 2026-09-16
depends_on: [booking-requirements]
relates_to: [sample-test-plan, sample-infra-design]
---

# 予約 CLI サンプルの非機能要件

> **TL;DR**: 学習用サンプルの品質目標は、検査が速く・再現性があり・文書と実装のずれを機械が見つけること。
> - 数値は**測定方法とセット**で書く。測れない目標は載せない
> - 可用性・性能の運用目標は持たない。常時稼働しないため未適用と明記する

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [要件定義](../../product/01-requirements.md) | REQ-001 / REQ-201 |
| 下流 | [解決戦略](02-solution-strategy.md) / [テスト計画](../test/01-test-plan.md) / [インフラ設計](08-infra-design.md) | SS-201 / TSP-001 / INF-001 |

## 1. 性能

| ID | 指標 | 目標値 | 測定方法 | 根拠 | 確度 |
|---|---|---|---|---|---|
| NFR-001 | `npm run sample:check` の所要時間 | 60 秒未満 (依存取得を除く) | `time npm run sample:check` | 学習中に待ちで中断させない | 実測 (2026-09-16 時点は 3 秒) |
| NFR-002 | `npm run sample:booking` の所要時間 | 5 秒未満 | `time npm run sample:booking` | 変更して即確認する流れを保つ | 実測 (2026-09-16 時点は 1 秒未満) |

## 2. 可用性

| ID | 指標 | 目標 | 計画停止の扱い | 未達時の対応 |
|---|---|---|---|---|
| NFR-101 | 実行の再現性 | 同じコミットで何度実行しても同じ出力 | 対象外 (常時稼働しない) | 時刻・乱数・外部依存の混入を疑い、注入経路へ戻す |

稼働率の目標は持たない。常時稼働するプロセスが無く、測定対象が存在しないため (原則: 無いものを書かない)。

## 3. セキュリティ

| ID | 要件 | 実装手段 | 検証方法 |
|---|---|---|---|
| NFR-201 | テナントのデータが混ざらない | 全 port が TenantId を取り、保存時にテナント一致を検証する | TST-201 / TST-206 |
| NFR-202 | 図と実装のずれを検出する | クラス図と domain の export を双方向照合する | `npm run sample:drift` |
| NFR-203 | 文書の表と実装の定義のずれを検出する | 遷移表・メッセージ表とコードの定義を突き合わせる | TST-214 / TST-215 |

認証・認可・行レベルセキュリティは未実装。NFR-201 はメモリ adapter 内の検証であり、認可の代わりにはならない。

## 4. 運用・監視閾値

| ID | 監視項目 | 閾値 | 通知先 | 一次対応 |
|---|---|---|---|---|
| NFR-301 | CI の `sample:check` 失敗 | 1 回でも失敗 | GitHub Actions の実行結果 | [Runbook 検査が失敗したとき](../../runbooks/01-check-failure.md) に従う |

実行時メトリクス (5xx 率・レイテンシ) の監視は無い。HTTP 面が無いため計測対象が存在しない。

## 5. 多言語・表示

| ID | 対象 | 言語 | フォールバック | 機械翻訳の可否 |
|---|---|---|---|---|
| NFR-401 | CLI 出力・エラー文言 | ja | なし | 不可 (文言は[メッセージ定義](06-messages.md)が正典) |
