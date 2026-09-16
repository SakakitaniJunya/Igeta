---
id: booking-tests
title: 予約 CLI サンプルのテスト仕様
type: design
kind: test-spec
arc42: 10
id_prefix: TST
status: draft
owners: [eng]
depends_on: [booking-functions, booking-domain]
relates_to: [booking-requirements, sample-test-plan, sample-messages]
---

# 予約 CLI サンプルのテスト仕様

> **TL;DR**: 15 件の自動テストで、作成・確定・キャンセル・定員・イベント・エラー変換・分離と、文書↔実装の一致を検証する。

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [機能一覧](../../basic/01-function-list.md) / [クラス図](../../detail/domain/03-booking.md) / [テスト計画](../01-test-plan.md) | FN-001〜008 / Reservation / TSP-101 |
| 下流 | [実行可能なテスト](../../../../booking.test.ts) / [文書契約のテスト](../../../../docs-contract.test.ts) | TST-201〜215（コード内の同じ ID） |

## 1. テストケース一覧

| ID | 層 | 対象 | 前提 (Given) | 操作 (When) | 期待結果 (Then) | 対応 REQ/FN |
|---|---|---|---|---|---|---|
| TST-201 | application | 作成・取得 | 定員 1 の枠 | 作成して取得 | 自テナントは draft、他は null | REQ-101 / FN-001 / FN-003 |
| TST-202 | domain | 禁止遷移 | draft の予約 | キャンセル→確定 | 確定は失敗、状態は cancelled | REQ-102 / FN-002 |
| TST-203 | domain | 作成イベント | 固定時刻で生成 | 2 回取り出す | 1 回目に ID・テナント・枠・時刻、2 回目は空 | REQ-105 / FN-005 |
| TST-204 | application | 入力検証 | 不正なテナント・予約・枠 ID | 作成 | statusCode 400、save 呼出 0 回 | REQ-104 / FN-004 |
| TST-205 | application | 未登録コード | 失敗する port | 作成 | statusCode 409、元のコードを details に保持 | REQ-104 / FN-004 |
| TST-206 | infrastructure | 越境保存 | 2 テナントと同じ予約 ID | 越境保存と通常保存 | 越境は拒否、通常保存は混ざらない | REQ-103 / FN-003 |
| TST-207 | infrastructure | 保存の明示性 | 保存済み予約 | 取得した集約を変更 | save 前は draft、後は confirmed | REQ-101 / FN-001 / FN-003 |
| TST-208 | application | 枠の存在確認 | 存在しない枠 ID | 作成 | statusCode 404、`TIME_SLOT_NOT_FOUND` | REQ-104 / FN-001 |
| TST-209 | application | 確定 | 定員 2 の枠と draft の予約 | 確定 | confirmed・残数 1・確定イベントが配信 | REQ-106 / FN-006 / FN-005 |
| TST-210 | application | 満席 | 定員 1 の枠と draft 2 件 | 1 件目を確定後に 2 件目を確定 | 409 `TIME_SLOT_SOLD_OUT`、2 件目は draft・残数 0 のまま | REQ-107 / FN-007 |
| TST-211 | application | キャンセルと返却 | 確定済み 1 件と draft 1 件 | それぞれキャンセル | 確定済みは残数 +1、draft は枠を触らない | REQ-108 / FN-008 |
| TST-212 | domain | 枠の不変条件 | 定員 0・不整合な復元・未予約の枠 | 生成・復元・返却・二重予約 | すべて失敗し、残数は範囲内に留まる | REQ-107 / FN-007 |
| TST-213 | application | 配信失敗 | 失敗する配信 port | 作成 | 呼び出し元へ失敗が伝わり、保存済み予約は残る | REQ-105 / FN-005 |
| TST-214 | 文書契約 | 状態遷移表 | 設計書の遷移表と実装の遷移定義 | 双方向で比較 | 過不足なく一致する | REQ-002 / FN-002 |
| TST-215 | 文書契約 | メッセージ定義 | 設計書のメッセージ表とエラーカタログ | 双方向で比較 | コード・HTTP・文言が一致する | REQ-002 / FN-004 |

## 2. 否定テスト (必須)

| ID | 観点 | ケース | 期待結果 |
|---|---|---|---|
| TST-202 | 禁止遷移 | cancelled → 確定 | `RESERVATION_TRANSITION_FORBIDDEN` |
| TST-204 | 入力不正 | 空テナント ID・予約 ID `!`・枠 ID `!` | 400、保存しない |
| TST-205 | 未登録コード | port が `SAMPLE_CONFLICT` を返す | 409、詳細にコードを保持 |
| TST-206 | テナント越境 | 別テナントの集約を保存 | `TENANT_MISMATCH`、保存しない |
| TST-208 | 対象なし | 存在しない枠 ID で作成 | 404、保存しない |
| TST-210 | 定員超過 | 残数 0 の枠へ確定 | 409、予約と枠を変更しない |
| TST-212 | 不変条件 | 定員 0・予約済み > 定員・未予約の枠の返却 | `TIME_SLOT_CAPACITY_INVALID` / `TIME_SLOT_NOT_RESERVED` |
| TST-213 | 配信失敗 | 配信 port が失敗を返す | 呼び出し元へ伝播 |
| TST-214 | 文書のずれ | 遷移表に行を足してコードを直さない | テスト失敗 |
| TST-215 | 文書のずれ | メッセージ表の文言を書き換える | テスト失敗 |

## 3. トレーサビリティ

| 確認 | 結果 |
|---|---|
| テストを持たない FN | なし。FN-001: 201/204/207/208、002: 202/214、003: 201/206/207、004: 204/205/215、005: 203/209/213、006: 209、007: 210/212、008: 211 |
| テストを持たない REQ | なし。REQ-101〜108 と REQ-002 がいずれかの TST に対応 |
| テストを持たない API | API 自体が対象外 |

認証・DB の RLS・HTTP 応答・並行アクセス・2 集約の原子性は、このテスト群では検証しない ([テスト計画](../01-test-plan.md) §5)。
