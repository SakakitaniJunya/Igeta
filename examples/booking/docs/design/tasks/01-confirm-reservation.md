---
id: sample-tasks-confirm
title: 実装タスク — 予約の確定とキャンセル
type: design
kind: tasks
id_prefix: T
id_pattern: bare-numeric
status: draft
canonical: true
owners: [eng]
created: 2026-09-16
depends_on: [booking-functions]
relates_to: [sample-sequences-booking, booking-tests]
---

# 実装タスク — 予約の確定とキャンセル

> **TL;DR**: 枠の集約を足し、確定とキャンセルの use case を通すまでの分解。全タスク完了済み。
> - 1 タスク = 1 commit 相当。チェックを付けるのは実装とテストが両方通ってから
> - `[P]` は別ファイルを触るタスクにだけ付く

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [機能一覧](../basic/01-function-list.md) / [シーケンス](../detail/sequences/01-booking.md) | FN-004〜008 / SEQ-002 / SEQ-003 |
| 下流 | [テスト仕様](../test/specs/01-booking.md) / 実装 `src/modules/booking/` | TST-208〜215 |

## Phase 1 Setup

- [x] T001 [FN-004] エラーコードと文言と HTTP の対応をカタログに集約する (`src/shared/kernel/error-catalog.ts`)
- [x] T002 [FN-004] カタログの statusCode で AppError を選ぶよう変換関数を直す (`src/shared/kernel/app-error.ts`)

## Phase 2 Foundational

- [x] T010 [FN-005] イベント配信のポートを共有カーネルに置く (`src/shared/kernel/event-publisher.port.ts`)
- [x] T011 [P] [FN-005] 収集だけを行う配信 adapter を作る (`src/modules/booking/infrastructure/in-memory-event-publisher.ts`)
- [x] T012 [P] [FN-002] 遷移表を定数として公開し、遷移判定をそこに寄せる (`src/modules/booking/domain/reservation.ts`)

## Phase 3+ User Story

### US-1 予約枠の定員を管理する (FN-007)

- [x] T100 [P] [FN-007] 枠 ID の値オブジェクトを作る (`src/modules/booking/domain/value-objects/time-slot-id.ts`)
- [x] T101 [FN-007] 定員と予約済み件数を守る枠の集約を作る (`src/modules/booking/domain/time-slot.ts`)
- [x] T102 [P] [FN-007] 枠の保存ポートを定義する (`src/modules/booking/domain/ports/time-slot.repository.port.ts`)
- [x] T103 [FN-007] 枠のメモリ adapter を作る (`src/modules/booking/infrastructure/in-memory-time-slot.repository.ts`)

### US-2 予約を確定・キャンセルする (FN-006 / FN-008)

- [x] T200 [P] [FN-006] 確定・キャンセルのイベントを追加する (`src/modules/booking/domain/events/`)
- [x] T201 [FN-006] 集約に confirm / cancel を足し、遷移の入口を 2 つに絞る (`src/modules/booking/domain/reservation.ts`)
- [x] T202 [FN-006] 確定の use case を作る (`src/modules/booking/application/use-cases/confirm-reservation.use-case.ts`)
- [x] T203 [FN-008] キャンセルの use case を作る (`src/modules/booking/application/use-cases/cancel-reservation.use-case.ts`)
- [x] T204 [FN-001] 予約作成に枠の存在確認とイベント配信を足す (`src/modules/booking/application/use-cases/create-reservation.use-case.ts`)

## Polish

- [x] T900 [FN-006] 枠の消費と返却まで見える CLI に差し替える (`demo.ts`)
- [x] T901 [FN-002] 遷移表とメッセージ表を実装と照合する検査を足す (`docs-contract.test.ts`)

## 依存と並列

| 前提 | 後続 | 理由 |
|---|---|---|
| T001 | T002 | カタログが無いと statusCode を引けない |
| T101 | T103 | 集約が無いと adapter の復元処理が書けない |
| T201 | T202 / T203 | 集約の confirm / cancel が無いと use case が書けない |
| T012 | T901 | 遷移表が公開されていないと照合できない |

**並列にしてよい組**: T011 と T012、T100 と T102、T200 と US-2 のうち別ファイルを触るもの。
