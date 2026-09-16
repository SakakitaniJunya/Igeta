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
relates_to: [booking-requirements]
---

# 予約 CLI サンプルのテスト仕様

> **TL;DR**: 7 件の自動テストで、作成・遷移・イベント・エラー変換・メモリ上の分離を検証する。

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [機能一覧](../../basic/01-function-list.md) / [クラス図](../../detail/domain/01-booking.md) | FN-001〜005 / Reservation |
| 下流 | [実行可能なテスト](../../../../booking.test.ts) | TST-201〜207（コード内の同じ ID） |

## 1. テストケース一覧

| ID | 層 | 対象 | 前提 (Given) | 操作 (When) | 期待結果 (Then) | 対応 REQ/FN/API |
|---|---|---|---|---|---|---|
| TST-201 | application | 作成・取得 | 有効な ID | 作成して取得 | 自テナントは draft、他は null | REQ-101 / FN-001 / FN-003 |
| TST-202 | domain | 状態遷移 | draft の予約 | 確定→キャンセル→再確定 | 最後はエラー、状態は cancelled | REQ-102 / FN-002 |
| TST-203 | domain | 作成イベント | 固定時刻で生成 | 2 回取り出す | 1 回目に ID・テナント・時刻、2 回目は空 | REQ-105 / FN-005 |
| TST-204 | application | 入力検証 | 不正な ID | 作成 | statusCode 400、save 呼出 0 回 | REQ-104 / FN-004 |
| TST-205 | application | 保存競合 | 失敗する port | 作成 | statusCode 409、元のコードを details に保持 | REQ-104 / FN-004 |
| TST-206 | infrastructure | 越境保存 | 2 テナントと同じ予約 ID | 越境保存と通常保存 | 越境は拒否、通常保存は混ざらない | REQ-103 / FN-003 |
| TST-207 | infrastructure | 保存の明示性 | 保存済み予約 | 取得した集約を変更 | save 前は draft、後は confirmed | REQ-101 / FN-001 / FN-003 |

## 2. 否定テスト (必須)

| ID | 観点 | ケース | 期待結果 |
|---|---|---|---|
| TST-202 | 禁止遷移 | cancelled → confirmed | RESERVATION_TRANSITION_FORBIDDEN |
| TST-204 | 入力不正 | 空テナント ID・予約 ID `!` | ValidationError、保存しない |
| TST-205 | 保存失敗 | port が SAMPLE_CONFLICT を返す | ConflictError、詳細を保持 |
| TST-206 | テナント越境 | 別テナントの集約を保存 | TENANT_MISMATCH、保存しない |

## 3. トレーサビリティ

| 確認 | 結果 |
|---|---|
| テストを持たない FN | なし。FN-001: 201/207、002: 202、003: 201/206/207、004: 204/205、005: 203 |
| テストを持たない API | API 自体が対象外 |

認証・DB の RLS・HTTP 応答・並行アクセスは、このテスト群では検証しない。
