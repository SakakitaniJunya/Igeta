# Igeta の予約サンプル

初めての方は **[読む順番と学習ロードマップ](../../docs/guides/00-start-here.md)** を開いてください。
実際の操作は [実習手順](../../docs/guides/02-booking-sample.md) に沿って進めます。このページはサンプルの参照用です。

架空の予約 CLI を題材に、**記入済み設計書 → コード → 自動検査**を追える例です。
arc42 の 12 章のうち 11 章 (§2 制約は要件定義の制約節と ADR が担う) を、23 本の設計書で埋めています。
Node.js 22 以上で、Igeta リポジトリのルートから実行します。

```bash
npm ci
npm run sample:booking
npm run sample:check
```

DB・環境変数・外部サービスは不要です。データは実行終了で消えます。

## 読む順番

| 順 | 文書 | arc42 | 学べること |
|---|---|---|---|
| 1 | [要件定義](docs/product/01-requirements.md) | §1 | EARS 記法、受入基準、制約、スコープ外 |
| 2 | [機能一覧](docs/design/basic/01-function-list.md) | §1 | REQ と FN の対応、権限・越境の欄 |
| 3 | [稼働構成 (AS-IS)](docs/architecture/01-overview.md) | §3 | 実測日付きの現構成と、TO-BE との分離 |
| 4 | [解決戦略](docs/design/basic/02-solution-strategy.md) | §4 | 技術判断の要約と、品質目標 → 検査手段の対応 |
| 5 | [ドメイン総論](docs/design/detail/domain/01-overview.md) → [集約マップ](docs/design/detail/domain/02-aggregate-map.md) → [クラス図](docs/design/detail/domain/03-booking.md) | §5 | コンテキスト、集約境界、図と実装の対応 |
| 6 | [モジュール仕様](docs/design/detail/modules/01-booking.md) | §5 | 公開面と依存方向、port の差し替え点 |
| 7 | [状態遷移](docs/design/detail/state-machines/01-reservation.md) → [シーケンス](docs/design/detail/sequences/01-booking.md) | §6 | 遷移表と副作用、失敗時にどこまで戻すか |
| 8 | [実行環境設計](docs/design/basic/08-infra-design.md) | §7 | ローカルと CI の設定値、費用 |
| 9 | [横断概念](docs/design/basic/04-crosscutting.md) → [区分値定義](docs/design/basic/05-code-definitions.md) → [メッセージ定義](docs/design/basic/06-messages.md) | §8 | エラー形式、テナント隔離、文言の正典 |
| 10 | [ADR-0001](docs/adr/0001-in-memory-persistence.md) / [ADR-0002](docs/adr/0002-capacity-on-confirmation.md) | §9 | 判断軸、却下案、代償、決定の確認方法 |
| 11 | [非機能要件](docs/design/basic/03-nonfunctional.md) → [テスト計画](docs/design/test/01-test-plan.md) → [テスト仕様](docs/design/test/specs/01-booking.md) | §10 | 測れる目標、否定テスト、検査していない範囲 |
| 12 | [リスクと技術的負債](docs/design/01-risks-tech-debt.md) | §11 | 意図した先送りと返済条件 |
| 13 | [用語集](docs/architecture/02-glossary.md) | §12 | 日本語と英語識別子の 1:1 対応 |
| 14 | [実装タスク](docs/design/tasks/01-confirm-reservation.md) / [Runbook](docs/runbooks/01-check-failure.md) | 章外 | 設計書から実装への分解、失敗時の切り分け |
| 15 | [demo.ts](demo.ts) / [booking.test.ts](booking.test.ts) / [docs-contract.test.ts](docs-contract.test.ts) | — | 実行経路と、仕様 ID の付いたテスト |
| 16 | [依存グラフ](docs/dependencies.md) | — | frontmatter から生成する文書間の関係 |

設計書は `templates/docs/` の必須節を埋めたものです。
domain / application と必要な shared kernel は、コード雛形を
`context=booking` / `aggregate=Reservation` で展開し、予約枠の集約・エラーカタログ・
イベント配信・メモリ adapter・CLI・テストを追加しています。
共有カーネルの `ForbiddenError` / `NotFoundError` が `details` を受け取る点だけが雛形との差分です
(403・404 でも原因コードを落とさないため)。

## 実行結果

```text
0. 枠を用意: {"timeSlotId":"slot-2026-09-20-1000","capacity":1}
1. 予約作成: {"reservationId":"reservation-001","timeSlotId":"slot-2026-09-20-1000","status":"draft"}
2. 予約確定: {"reservationId":"reservation-001","status":"confirmed","remainingCapacity":0}
3. 満席の枠を拒否: 409 TIME_SLOT_SOLD_OUT
4. キャンセルで枠を返却: {"reservationId":"reservation-001","status":"cancelled","releasedCapacity":true}
5. 返却された枠で確定: {"reservationId":"reservation-002","status":"confirmed","remainingCapacity":0}
6. 二重キャンセルを拒否: 409 RESERVATION_TRANSITION_FORBIDDEN
7. 別テナントからの取得: null
8. 配信済みイベント: booking.reservation.created → booking.reservation.confirmed → booking.reservation.created → booking.reservation.cancelled → booking.reservation.confirmed
サンプル完了（保存先はメモリのみ）
```

## 何が機械で検査されるか

`npm run sample:check` は次を順に実行します。Igeta 自身の `docs/` とサンプルの `examples/booking/docs/` は別々に検査します。

| 検査 | 対象 | 落ちる条件 |
|---|---|---|
| `sample:docs:check` | 23 本の設計書 | 必須節の欠落、ID 形式、上流下流の空欄、索引の古さ、EARS 記法違反、参照切れ |
| `sample:typecheck` | TypeScript 全体 | 型エラー |
| `sample:test` | 15 件のテスト | 仕様どおりに動かない、または**設計書の表と実装の定義がずれた** (TST-214 / TST-215) |
| `sample:drift` | クラス図 ↔ `domain/` の export | 図にあって実装に無い、実装にあって図に無い |
| `sample:deps` | レイヤ依存 | domain が外側や npm に依存、application が infrastructure を知る、循環 |

## 自分で変更してみる

1. 要件 → 機能 → 状態遷移・クラス図 → テスト仕様の順に変更します。
2. コードとテストを変更します。テスト名には対応する `TST-xxx` を付けます。
3. `npm run sample:docs:graph` でサンプルの索引を再生成します。
4. `npm run sample:check` と `npm run docs:lint` を実行します。

ずれの検出は 2 通り体験できます。

- 図から `class ReservationId` を一時的に消すと `npm run sample:drift` が失敗します。
- [状態遷移](docs/design/detail/state-machines/01-reservation.md)の遷移表か
  [メッセージ定義](docs/design/basic/06-messages.md)の文言を書き換えると `npm run sample:test` が失敗します。

どちらも変更を戻せば成功します。図と表が実装と契約していることを確認できます。

## 範囲

これは学習用の仕様と CLI です。実サービスの予約要件ではありません。
画面・HTTP・認証・認可・DB/RLS・料金・決済・イベントの購読は未実装で、
画面設計・API 仕様・テーブル定義の設計書もありません
(実装が無い状態で書くと検査できない文書が増えるため。[リスク](docs/design/01-risks-tech-debt.md) RSK-202)。

テナント分離のテストはメモリ adapter 内の検査で、認可や RLS を代替しません。
同一テナント・同一 ID の save は更新となり、重複作成は拒否しません。
確定・キャンセルは 2 集約を順次保存し、途中失敗の補償はありません (RSK-101)。

自分の案件への展開方法は [利用ガイド](../../docs/guides/02-booking-sample.md) と
[案件ロードマップ](../../docs/guides/03-project-roadmap.md) にあります。
