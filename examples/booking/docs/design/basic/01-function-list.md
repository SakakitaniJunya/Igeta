---
id: booking-functions
title: 予約 CLI サンプルの機能一覧
type: design
kind: function-list
arc42: 1
id_prefix: FN
status: draft
owners: [eng]
depends_on: [booking-requirements]
relates_to: [booking-domain, booking-tests]
---

# 予約 CLI サンプルの機能一覧

> **TL;DR**: CLI・テストから呼ぶ 5 機能と、その上流要件・下流設計を示す。

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [要件定義](../../product/01-requirements.md) | REQ-101〜105 |
| 下流 | [クラス図](../detail/domain/01-booking.md) / [テスト仕様](../test/specs/01-booking.md) | Reservation / TST-201〜207 |

## 1. 機能一覧

| ID | 機能名 | 概要 | アクター | 対応 REQ | 対応 SCR | 対応 API | 実装コンテキスト | 段階 |
|---|---|---|---|---|---|---|---|---|
| FN-001 | 予約作成 | draft の予約を保存 | 開発者 | REQ-101 | 対象外 | 対象外 | booking | サンプル |
| FN-002 | 状態遷移 | 確定・キャンセルと禁止遷移の拒否 | 開発者 | REQ-102 | 対象外 | 対象外 | booking | サンプル |
| FN-003 | テナント別保存・取得 | 同じ ID でもテナント別に管理 | 開発者 | REQ-103 | 対象外 | 対象外 | booking | サンプル |
| FN-004 | エラー変換 | ドメインの失敗を AppError に変換 | 開発者 | REQ-104 | 対象外 | 対象外 | booking | サンプル |
| FN-005 | イベント取得 | 作成イベントを一度だけ取り出す | 開発者 | REQ-105 | 対象外 | 対象外 | booking | サンプル |

## 2. 機能別の状態・権限

| ID | 参照可能なロール | 作成/更新可能なロール | テナント越境 | 備考 |
|---|---|---|---|---|
| FN-001 | ローカル開発者 | ローカル開発者 | 不可 | ロール認証は対象外 |
| FN-002 | ローカル開発者 | ローカル開発者 | 対象外 | 取得済み集約に対する操作 |
| FN-003 | ローカル開発者 | ローカル開発者 | 不可 | メモリ adapter 内の分離。認可・RLS は未実装 |
| FN-004 | ローカル開発者 | ローカル開発者 | 対象外 | HTTP 応答ではなくエラーの statusCode を確認 |
| FN-005 | ローカル開発者 | ローカル開発者 | 対象外 | イベントの外部配信は対象外 |

## 3. カバレッジ確認

| 確認 | 結果 |
|---|---|
| FN を持たない機能要件 REQ | なし。REQ-101〜105 が FN-001〜005 に対応 |
| REQ に紐づかない FN | なし |
