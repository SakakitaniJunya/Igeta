---
id: sample-code-definitions
title: 予約 CLI サンプルの区分値定義
type: design
kind: code-definitions
arc42: 8
id_prefix: CD
status: draft
canonical: true
owners: [eng]
created: 2026-09-16
depends_on: [booking-domain]
relates_to: [sample-state-machine-reservation, sample-messages]
---

# 予約 CLI サンプルの区分値定義

> **TL;DR**: 予約状態と状態を変える事象の 2 つが区分値で、どちらも union type としてコードに 1 か所だけ持つ。
> - **格納値と表示名を分ける**。表示名を保存しない
> - 区分値の追加は本書を先に直す。コードだけ足すのは禁止

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [クラス図](../detail/domain/03-booking.md) | ReservationStatus / ReservationEvent |
| 下流 | [状態遷移](../detail/state-machines/01-reservation.md) / [メッセージ定義](06-messages.md) | STM-101 / MSG-008 |

## 1. 区分値一覧

| ID | 区分 | 対応 enumeration クラス | 使用箇所 | 値の追加可否 |
|---|---|---|---|---|
| CD-001 | 予約状態 | ReservationStatus | 予約集約の現在状態・保存行 | 設計変更を伴う (状態遷移表も直す) |
| CD-002 | 状態を変える事象 | ReservationEvent | 予約集約の公開メソッド名 | 設計変更を伴う (遷移表とメソッドを同時に足す) |

## 2. 値の定義

### CD-001 予約状態

| 格納値 | 表示名 (ja) | 意味 | 並び順 |
|---|---|---|---|
| draft | 作成済み | 枠を消費していない予約。確定かキャンセルを待つ | 10 |
| confirmed | 確定 | 枠を 1 件消費した予約 | 20 |
| cancelled | キャンセル | 取り消した予約。終端で、ここからは遷移しない | 30 |

### CD-002 状態を変える事象

| 格納値 | 表示名 (ja) | 対応メソッド | 枠への副作用 |
|---|---|---|---|
| confirm | 確定 | `Reservation.confirm` | 枠を 1 件消費する |
| cancel | キャンセル | `Reservation.cancel` | 確定済みからのときだけ 1 件返す |

## 3. 格納形式の方針

| ID | 方針 | 理由 | 例外 |
|---|---|---|---|
| CD-101 | union type の文字列リテラルで持つ | 追加時に型エラーで漏れが見つかる | なし |
| CD-102 | 導出できる値は区分値にしない | 枠の満席は定員と予約済み数から導出できる | なし (満席を状態として持たない) |

表示名の辞書と多言語対応は未整備。CLI は日本語固定で、表示名は本書が正典。
