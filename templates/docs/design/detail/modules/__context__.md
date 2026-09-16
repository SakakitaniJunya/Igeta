---
id: <kebab-slug>
title: モジュール仕様
type: architecture
kind: module-spec
arc42: 5
id_prefix: MOD
status: draft
canonical: true
owners: [eng]
created: YYYY-MM-DD
depends_on: [domain-model, sequence-spec]
relates_to: [test-plan]
---

<!--
  arc42 §5 Building Block View (構成要素) — arc42 公式の Content / Motivation / Form より訳出
  何を書く章か: システムの静的な分解 (モジュール / コンポーネント / クラス / データ構造) と依存関係。家でいう間取り図。
    L1 = 全体の白箱 + 直下要素の黒箱、L2 = 選んだ要素の内側、と階層で掘る。
  なぜ必要か: 実装詳細を晒さずに構造を共有し、ソースコードの見通しを保つため。arc42 で唯一「必須」の章。
  書かない方がよいもの: 実行時の振る舞い (→ §6) と配置・インフラ (→ §7)。網羅より階層を優先する。
  出典: https://arc42.org/overview/ / https://docs.arc42.org/section-5/
-->

# モジュール仕様

> **TL;DR**: <対象 module の責務を 1 文で>
> - **公開面 = `modules/<context>/index.ts` に export したものだけ**。ここに載っていないものは他 module から見えない
> - 依存方向は dependency-cruiser が CI で強制する。本書はその意図を書く

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [ドメインクラス図](../domain/) / [シーケンス](../sequences/) | CLS: * / SEQ-* |
| 下流 | [テスト計画](../../test/01-test-plan.md) / 実装 `apps/api/src/modules/<context>/` | TST-* |

## 1. モジュール一覧

| ID | module (context) | 責務 | 上流 module | 公開面の種類 |
|---|---|---|---|---|
| MOD-001 | reservation | 予約の受付と状態遷移 | room, identity | UseCase / DTO / Event |

## 2. 公開面 (index.ts)

### MOD-001 <モジュール名>

| 種別 | 名前 | 用途 | 破壊的変更時の影響先 |
|---|---|---|---|
| application service | CreateReservationUseCase | 予約作成 | |
| DTO 型 | CreateReservationInput/Output | 入出力 | |
| domain event | ReservationConfirmedEvent | 確定通知 | notification |

## 3. 依存

| ID | 依存先 module | 手段 (公開 API / event) | 逆方向の依存 | 循環の有無 |
|---|---|---|---|---|
| MOD-001 | room | 公開 UseCase 呼び出し | なし | なし |

## 4. ポートと adapter の束ね

| ID | port | token (Symbol) | 既定 adapter | 差し替え手順 |
|---|---|---|---|---|
| MOD-001 | ReservationRepositoryPort | RESERVATION_REPOSITORY | PrismaReservationRepository | providers.ts 1 行 |

## 5. 切り出し可能性 (任意)

| ID | 切り出しの障害 | 解消に必要な作業 |
|---|---|---|
