---
id: adr-0002-capacity-on-confirmation
title: ADR-0002 枠の定員は確定時に消費する
type: adr
kind: adr
arc42: 9
status: accepted
canonical: true
owners: [eng]
created: 2026-09-16
proposed: 2026-09-16
accepted: 2026-09-16
depends_on: [adr-0001-in-memory-persistence]
relates_to: [sample-aggregate-map, sample-state-machine-reservation, booking-functions]
---

# ADR-0002: 枠の定員は確定時に消費する

> **TL;DR**: 予約の作成 (draft) では枠を消費せず、確定 (confirmed) で 1 件消費し、確定済みのキャンセルで返す。
> - 作成は枠の存在だけを確認する。満席でも draft は作れる
> - 代償として、draft が枠を押さえないため、確定が先着順になる
> - 却下: 作成時に消費して期限切れで解放する方式 (時間で動く処理が必要になる)

## 関連

- **上流 (depends_on)**: [ADR-0001 保存先をメモリに限定する](0001-in-memory-persistence.md)
- **下流**: [集約マップ](../design/detail/domain/02-aggregate-map.md) / [状態遷移](../design/detail/state-machines/01-reservation.md) / [機能一覧](../design/basic/01-function-list.md)

## Status

2026-09-16 accepted / 決定者: サンプル作成者。

## Context

予約と予約枠は別の集約で、同時に守れる不変条件は集約ごとに 1 つ。
「定員を超えない」をどの操作で守るかを決めないと、作成・確定・キャンセルのどこで枠が動くかが実装ごとにぶれる。

## Decision Drivers

- 定員超過を 1 か所で止められるか
- 時間で動く処理 (期限切れ解放) を持ち込まずに済むか
- 状態遷移表と副作用の対応が読み切れるか

## Decision

**採用: 確定時に消費する**。理由: 定員の判定を確定 1 か所に閉じられ、期限管理が不要になるため。

| 判断軸 | 確定時に消費 | 作成時に消費 |
|---|---|---|
| 判定箇所 | 確定のみ | 作成・期限切れ・確定の 3 か所 |
| 時間で動く処理 | 不要 | 必要 (仮押さえの期限切れ解放) |
| 遷移表の読みやすさ | 副作用が 2 行に収まる | 期限切れ遷移が増える |

## 却下した選択肢

- **作成時に消費し期限切れで解放**: 実サービスでは妥当だが、ジョブか遅延評価が必要でサンプルの範囲を超える。
- **枠を予約集約に含める**: 定員の整合は取りやすいが、枠 1 つに対する更新が全予約で競合する。

## Consequences

- 良い方向: 定員超過は `TimeSlot.reserve` だけが判定する。確定が失敗しても予約は draft のまま残る。
- 代償: draft は枠を押さえないため、複数の draft が同じ枠を狙うと確定の先着順になる。この挙動は要件 REQ-107 として明示している。

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `npm run sample:test` | TST-209 / TST-210 / TST-211 | 確定で枠が減らない、満席で確定できる、返却されない |
| `npm run sample:test` | TST-214 | 遷移表と実装の遷移定義がずれたとき |
| `npm run sample:drift` | クラス図 ↔ 実装 | TimeSlot 側の型が図から消えたとき |

## 再検討トリガ

仮押さえ (期限付き) の要件が出たとき、または 1 枠あたりの同時確定が競合して失敗率が問題になったとき。
