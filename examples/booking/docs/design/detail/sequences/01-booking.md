---
id: sample-sequences-booking
title: 予約 CLI サンプルのシーケンス仕様
type: architecture
kind: sequence-spec
arc42: 6
id_prefix: SEQ
status: draft
canonical: true
owners: [eng]
created: 2026-09-16
depends_on: [booking-domain]
relates_to: [sample-module-booking, booking-tests, sample-state-machine-reservation]
---

# 予約 CLI サンプルのシーケンス仕様

> **TL;DR**: 作成・確定・キャンセルの 3 ユースケースを、use case → 集約 → port の順に追える形で示す。
> - 1 ユースケース = 1 シーケンス図。レイヤを lifeline に出す
> - 保存の境界と、失敗時にどこまで戻すかを図に明示する

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [クラス図](../domain/03-booking.md) / [機能一覧](../../basic/01-function-list.md) | class 名 / FN-001〜007 |
| 下流 | [モジュール仕様](../modules/01-booking.md) / [テスト仕様](../../test/specs/01-booking.md) | MOD-001 / TST-201〜213 |

## 1. ユースケース一覧

| ID | ユースケース | 対応 FN | 主集約 | 保存の境界 |
|---|---|---|---|---|
| SEQ-001 | 予約を作成する | FN-001 | Reservation | 予約 1 件 |
| SEQ-002 | 予約を確定する | FN-006 | Reservation + TimeSlot | 枠 → 予約の順に 2 回 (トランザクションなし) |
| SEQ-003 | 予約をキャンセルする | FN-008 | Reservation + TimeSlot | 確定済みのときだけ枠 → 予約の 2 回 |

## 2. シーケンス図

### SEQ-001 予約を作成する

```mermaid
sequenceDiagram
  participant D as demo.ts (入口)
  participant U as CreateReservationUseCase
  participant S as TimeSlotRepositoryPort
  participant A as Reservation (集約)
  participant R as ReservationRepositoryPort
  participant P as EventPublisherPort
  D->>U: execute(tenantId, reservationId, timeSlotId)
  U->>U: ID を値オブジェクトへ変換 (不正なら 400)
  U->>S: findById(枠) — 存在確認のみ
  S-->>U: TimeSlot / null (null は 404)
  U->>A: create(...) → draft + 作成イベント
  U->>R: save(tenantId, 予約)
  R-->>U: Result<void>
  U->>P: publish(pullEvents())
  U-->>D: reservationId / timeSlotId / status=draft
```

### SEQ-002 予約を確定する

```mermaid
sequenceDiagram
  participant D as demo.ts (入口)
  participant U as ConfirmReservationUseCase
  participant R as ReservationRepositoryPort
  participant S as TimeSlotRepositoryPort
  participant T as TimeSlot (集約)
  participant A as Reservation (集約)
  participant P as EventPublisherPort
  D->>U: execute(tenantId, reservationId)
  U->>R: findById(予約) — null は 404
  U->>S: findById(枠) — null は 404
  U->>T: reserve() — 満席なら 409 で中断 (保存しない)
  U->>A: confirm(now) — 遷移不可なら 409 で中断 (保存しない)
  U->>S: save(枠)
  U->>R: save(予約)
  U->>P: publish(確定イベント)
  U-->>D: status=confirmed / remainingCapacity
```

### SEQ-003 予約をキャンセルする

```mermaid
sequenceDiagram
  participant D as demo.ts (入口)
  participant U as CancelReservationUseCase
  participant R as ReservationRepositoryPort
  participant A as Reservation (集約)
  participant S as TimeSlotRepositoryPort
  participant T as TimeSlot (集約)
  participant P as EventPublisherPort
  D->>U: execute(tenantId, reservationId)
  U->>R: findById(予約) — null は 404
  U->>U: キャンセル前の状態を記録 (confirmed か否か)
  U->>A: cancel(now) — 遷移不可なら 409 で中断
  alt 確定済みだった
    U->>S: findById(枠) → T
    U->>T: release()
    U->>S: save(枠)
  end
  U->>R: save(予約)
  U->>P: publish(キャンセルイベント)
  U-->>D: status=cancelled / releasedCapacity
```

## 3. 例外・補償

| ID | 失敗点 | 検出 | 戻す範囲 | 呼び出し側への表現 |
|---|---|---|---|---|
| SEQ-001 | 枠が存在しない | use case (取得結果が null) | 保存前なので戻す対象なし | 404 `TIME_SLOT_NOT_FOUND` |
| SEQ-002 | 枠が満席 | TimeSlot.reserve | 保存前なので戻す対象なし | 409 `TIME_SLOT_SOLD_OUT` |
| SEQ-002 | 予約が確定できない状態 | Reservation.confirm | 枠のオブジェクトは変更済みだが保存しない | 409 `RESERVATION_TRANSITION_FORBIDDEN` |
| SEQ-002 | 枠の保存後に予約の保存が失敗 | port の戻り値 | **戻せない** (トランザクションなし) | 保存先由来のコードをそのまま変換。RSK-101 |
| SEQ-003 | 枠が見つからない | use case | 予約はまだ保存していない | 404 `TIME_SLOT_NOT_FOUND` |

## 4. 発行イベントと購読

| ID | 発行イベント | 発行タイミング | 購読側 | 失敗時の再送 |
|---|---|---|---|---|
| SEQ-001 | booking.reservation.created | 予約の保存後 | 無し (収集のみ) | しない (失敗は呼び出し元へ返す) |
| SEQ-002 | booking.reservation.confirmed | 枠と予約の保存後 | 同上 | 同上 |
| SEQ-003 | booking.reservation.cancelled | 予約の保存後 | 同上 | 同上 |

## 5. 外部サービス呼び出し

外部サービスを呼ばない。タイムアウト・リトライ・冪等キーの設計も持たない (ADR-0001)。
