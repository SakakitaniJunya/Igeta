---
id: sample-test-plan
title: 予約 CLI サンプルのテスト計画
type: design
kind: test-plan
arc42: 10
id_prefix: TSP
status: draft
canonical: true
owners: [eng]
created: 2026-09-16
depends_on: [sample-nonfunctional, booking-functions]
relates_to: [booking-tests, sample-runbook-check-failure]
---

# 予約 CLI サンプルのテスト計画

> **TL;DR**: 自動テスト 15 件と、図↔実装・レイヤ依存の構造検査で「設計書どおりに動く」ことを確認する。
> - **正常系だけのテストは未完成**。層ごとに否定テストを必須にする
> - 緑であることと安全であることは別。検査できていない範囲を §5 に明記する

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [非機能要件](../basic/03-nonfunctional.md) / [機能一覧](../basic/01-function-list.md) | NFR-001〜301 / FN-001〜008 |
| 下流 | [テスト仕様](specs/01-booking.md) / [Runbook 検査が失敗したとき](../../runbooks/01-check-failure.md) | TST-201〜215 / RUN-001 |

## 1. テストピラミッド

| 層 | 対象 | ツール | 実行タイミング | 必須の否定テスト |
|---|---|---|---|---|
| 単体 | domain (集約・値オブジェクト) | `node --test` (tsx 経由) | `npm run sample:test` / 全 push | 遷移表に無い遷移・定員超過・返却不能 |
| 単体 | application (use case) | 同上 | 同上 | 入力不正・対象なし・満席・配信失敗 |
| 結合相当 | infrastructure (メモリ adapter) | 同上 | 同上 | テナント越境の保存・save 前の未反映 |
| 文書契約 | 設計書の表 ↔ 実装の定義 | 同上 (`docs-contract.test.ts`) | 同上 | 遷移表・メッセージ表の過不足 |
| 構造 | 図 ↔ 実装 / レイヤ依存 | `sample:drift` / `sample:deps` | 同上 | 図に無い export・レイヤ違反 |

カバレッジ計測は導入していない。目標値を書いても測る手段が無いため (原則: 無いものを書かない)。

## 2. テスト環境

| ID | 環境 | データ | 外部サービス | 破棄方針 |
|---|---|---|---|---|
| TSP-001 | ローカル / CI 共通 | テスト内の fixture で枠 1 件を毎回作る | 無し | プロセス終了で破棄 |
| TSP-002 | 時刻 | `2026-09-16T00:00:00Z` を固定値で注入 | 無し | — |

## 3. Definition of Done

| 対象 | DoD |
|---|---|
| 1 機能の変更 | 該当層のテストが緑 + `npm run sample:check` が緑 + 上流の設計書を同じ変更で更新済み |
| 設計書だけの変更 | `npm run sample:docs:graph` で索引を再生成 + `sample:docs:check` と `docs:lint` が緑 |
| サンプル全体 | CI の `check` ジョブが緑 (自己テスト・記法・索引・テンプレ適合・`sample:check`・CLI 実行) |

## 4. 品質ゲートと例外

| ID | ゲート | 落ちたときの扱い | 例外を認める条件 |
|---|---|---|---|
| TSP-101 | `sample:test` の失敗 | 変更を進めない | なし |
| TSP-102 | `sample:drift` の失敗 | 図か実装のどちらかを直す。片方だけの更新は不可 | なし |
| TSP-103 | `sample:docs:check` の失敗 | 索引を再生成し、参照先を直す | なし |
| TSP-104 | 検査不能 (exit 2) | 設定不備として扱い、緑にしない | なし |

## 5. 検査していない範囲

- 認証・認可・行レベルセキュリティ。テナント分離の検査はメモリ adapter 内の比較にとどまる。
- 並行実行と競合。単一プロセスの逐次実行のみを検証する。
- 2 集約の保存の原子性。トランザクションが無いため、途中失敗の一貫性は検証できない (RSK-101)。
- 性能・負荷。所要時間は NFR-001 として測るが、負荷試験は行わない。
