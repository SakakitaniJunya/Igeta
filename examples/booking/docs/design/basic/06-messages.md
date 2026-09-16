---
id: sample-messages
title: 予約 CLI サンプルのメッセージ定義
type: design
kind: messages
arc42: 8
id_prefix: MSG
status: draft
canonical: true
owners: [eng]
created: 2026-09-16
depends_on: [sample-crosscutting]
relates_to: [sample-code-definitions, booking-tests]
---

# 予約 CLI サンプルのメッセージ定義

> **TL;DR**: エラーコードと文言と HTTP ステータスの対応表。実体は `error-catalog.ts` で、TST-215 が本表と突き合わせる。
> - **文言をコードに直書きしない**。同じ事象に 2 通りの文言が出る状態を作らない
> - 文言は**次にすべき行動**を含める。「エラーが発生しました」だけの文言は不合格

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [横断概念](04-crosscutting.md) | XC-201〜204 |
| 下流 | [テスト仕様](../test/specs/01-booking.md) / 実装 `src/shared/kernel/error-catalog.ts` | TST-215 |

## 1. エラーメッセージ一覧

<!-- コード列・HTTP 列・文言列は error-catalog.ts と TST-215 で機械照合する。手で編集したらテストが落ちる -->

| ID | コード | HTTP | 文言 (ja) | 発生箇所 |
|---|---|---|---|---|
| MSG-001 | `TENANT_ID_INVALID` | 400 | テナント ID の形式が不正です。英小文字・数字・ハイフンで指定してください。 | TenantId.create |
| MSG-002 | `RESERVATION_ID_INVALID` | 400 | 予約 ID の形式が不正です。英小文字・数字・ハイフンの 8〜64 文字で指定してください。 | ReservationId.create |
| MSG-003 | `TIME_SLOT_ID_INVALID` | 400 | 予約枠 ID の形式が不正です。英小文字・数字・ハイフンの 8〜64 文字で指定してください。 | TimeSlotId.create |
| MSG-004 | `TIME_SLOT_CAPACITY_INVALID` | 400 | 予約枠の定員は 1 以上の整数で指定してください。 | TimeSlot.create / restore |
| MSG-005 | `TENANT_MISMATCH` | 403 | 他テナントのデータは操作できません。テナントを切り替えてください。 | メモリ adapter の save |
| MSG-006 | `RESERVATION_NOT_FOUND` | 404 | 予約が見つかりません。予約 ID を確認してください。 | 確定・キャンセルの use case |
| MSG-007 | `TIME_SLOT_NOT_FOUND` | 404 | 予約枠が見つかりません。枠 ID を確認してください。 | 作成・確定・キャンセルの use case |
| MSG-008 | `RESERVATION_TRANSITION_FORBIDDEN` | 409 | 現在の予約状態からは実行できない操作です。予約状態を確認してください。 | Reservation.confirm / cancel |
| MSG-009 | `TIME_SLOT_SOLD_OUT` | 409 | 予約枠が満席です。別の枠を選んでください。 | TimeSlot.reserve |
| MSG-010 | `TIME_SLOT_NOT_RESERVED` | 409 | 返却できる予約がない枠です。枠の予約数を確認してください。 | TimeSlot.release |

カタログに無いコードは 409 として扱い、元のコードを `details.code` に残す (XC-204)。

## 2. 通知テンプレート一覧

利用者への通知 (メール・LINE・プッシュ) は無い。宛先となる利用者情報を扱わないため、テンプレートも持たない。
コンテキスト外へ出るのはドメインイベント 3 種 (`booking.reservation.created` / `confirmed` / `cancelled`) だけで、購読側はまだ無い。

## 3. 送信失敗時の扱い

| ID | 通知 | リトライ | 上限 | 失敗を利用者に見せるか | 記録 |
|---|---|---|---|---|---|
| MSG-101 | ドメインイベントの配信 | しない | — | 見せる (配信失敗をそのまま呼び出し元へ返す) | なし |

保存の後に配信するため、配信が失敗しても予約は保存済みのまま残る。補償処理は未実装で、[リスク](../01-risks-tech-debt.md) RSK-101 に残している。検証は TST-213。

## 4. 文言の管理方針

| ID | 方針 | 実体の置き場 | ずれの検出方法 |
|---|---|---|---|
| MSG-201 | コード → 文言 → HTTP を 1 か所に持つ | `src/shared/kernel/error-catalog.ts` | TST-215 が本書 §1 の表とカタログを双方向で比較する |
| MSG-202 | ドメインは文言を書かず、コードだけを返す | `domainError(code, details)` | 文言の直書きはレビューで落とす (機械検査は未整備) |
