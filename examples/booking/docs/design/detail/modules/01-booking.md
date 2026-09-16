---
id: sample-module-booking
title: 予約 CLI サンプルのモジュール仕様
type: architecture
kind: module-spec
arc42: 5
id_prefix: MOD
status: draft
canonical: true
owners: [eng]
created: 2026-09-16
depends_on: [booking-domain, sample-sequences-booking]
relates_to: [sample-test-plan, sample-crosscutting]
---

# 予約 CLI サンプルのモジュール仕様

> **TL;DR**: booking モジュールの公開面は 3 つの use case と DTO とイベントで、保存とイベント配信は port 経由。
> - 公開面に載っていないものは外から使わせない (集約と adapter は内部)
> - 依存方向は `npm run sample:deps` が機械で強制する。本書はその意図を書く

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [クラス図](../domain/03-booking.md) / [シーケンス](../sequences/01-booking.md) | class 名 / SEQ-001〜003 |
| 下流 | [テスト計画](../../test/01-test-plan.md) / 実装 `src/modules/booking/` | TSP-001 |

## 1. モジュール一覧

| ID | module (context) | 責務 | 上流 module | 公開面の種類 |
|---|---|---|---|---|
| MOD-001 | booking | 予約の受付・状態遷移と、枠の定員管理 | なし (共有カーネルのみ) | UseCase / DTO / DomainEvent |

## 2. 公開面 (index.ts)

### MOD-001 booking

| 種別 | 名前 | 用途 | 破壊的変更時の影響先 |
|---|---|---|---|
| use case | CreateReservationUseCase | 予約を draft で作る | demo.ts / テスト |
| use case | ConfirmReservationUseCase | 予約を確定し枠を消費する | 同上 |
| use case | CancelReservationUseCase | 予約を取り消し枠を返す | 同上 |
| DTO 型 | Create/Confirm/CancelReservationInput・Output | 入出力 | 同上 |
| domain event | ReservationCreated/Confirmed/CancelledEvent | コンテキスト外への通知 | 購読側 (未実装) |

集約 (Reservation / TimeSlot)・値オブジェクト・adapter は内部実装で、公開面には含めない。
このサンプルは `index.ts` を持たない。他 module が無く、公開面を絞る対象がまだ無いため (原則: 無いものを書かない)。

## 3. 依存

| ID | 依存先 | 手段 | 逆方向の依存 | 循環の有無 |
|---|---|---|---|---|
| MOD-001 | 共有カーネル `src/shared/kernel/` | 直接 import (Result・TenantId・エラーカタログ・配信ポート) | なし (カーネルは modules を知らない) | なし |
| MOD-001 | 他の業務 module | 無し | — | — |

`npm run sample:deps` が強制する線は 4 つ。domain は自 domain と共有カーネルのみ、domain と application は npm パッケージを持たない、application は infrastructure を知らない、循環は禁止。

## 4. ポートと adapter の束ね

| ID | port | token (Symbol) | 既定 adapter | 差し替え手順 |
|---|---|---|---|---|
| MOD-001 | ReservationRepositoryPort | RESERVATION_REPOSITORY | InMemoryReservationRepository | use case の生成箇所 (demo.ts / テスト) で差し替える |
| MOD-001 | TimeSlotRepositoryPort | TIME_SLOT_REPOSITORY | InMemoryTimeSlotRepository | 同上 |
| MOD-001 | EventPublisherPort | EVENT_PUBLISHER | InMemoryEventPublisher | 同上 |

DI コンテナは使わない。token は雛形との対応を保つために定義しているが、束ねているのは demo.ts とテストのコンストラクタ呼び出し。

## 5. 切り出し可能性

| ID | 切り出しの障害 | 解消に必要な作業 |
|---|---|---|
| MOD-001 | 保存先がプロセス内メモリで、モジュール外からも同じ Map を参照できない | DB adapter を用意し、接続をモジュール境界の外で束ねる |
