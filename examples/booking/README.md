# Igeta の予約サンプル

架空の予約 CLI を題材に、**記入済み設計書 → コード → 自動検査**を追える例です。
Node.js 22 以上で、Igeta リポジトリのルートから実行します。

```bash
npm ci
npm run sample:booking
npm run sample:check
```

DB・環境変数・外部サービスは不要です。データは実行終了で消えます。

## 読む順番

| 順 | ファイル | 学べること |
|---|---|---|
| 1 | [要件定義](docs/product/01-requirements.md) | EARS 形式、受入基準、制約、スコープ外 |
| 2 | [機能一覧](docs/design/basic/01-function-list.md) | REQ と FN の対応 |
| 3 | [クラス図](docs/design/detail/domain/01-booking.md) | 図と TypeScript export の対応、不変条件 |
| 4 | [テスト仕様](docs/design/test/specs/01-booking.md) | TST と REQ/FN、正常系・否定テスト |
| 5 | [demo.ts](demo.ts) / [booking.test.ts](booking.test.ts) | 実行経路と仕様 ID の付いたテスト |
| 6 | [依存グラフ](docs/dependencies.md) | frontmatter から生成する文書間の関係 |

設計書は `templates/docs/` の必須節を埋めたものです。
domain / application と必要な shared kernel は、コード雛形を
`context=booking` / `aggregate=Reservation` で展開しています。
メモリ repository・CLI・テスト・実行設定を追加しました。
`ConflictError` が詳細を破棄する不具合は生成元とサンプルの両方で修正しています。

## 実行結果

```text
1. 予約作成: {"reservationId":"reservation-001","status":"draft"}
2. 予約確定: confirmed
3. キャンセル: cancelled
4. 再確定を拒否: RESERVATION_TRANSITION_FORBIDDEN
5. 別テナントからの取得: null
サンプル完了（保存先はメモリのみ）
```

`sample:check` は、文書の索引・リンク・テンプレ適合、型、7 テスト、図↔実装、レイヤ依存を検査します。
Igeta 自身の `docs/` とサンプルの `examples/booking/docs/` は別々に検査します。

## 自分で変更してみる

1. 要件 → 機能 → クラス図 → テスト仕様の順に変更します。
2. コードとテストを変更します。テスト名には対応する `TST-xxx` を付けます。
3. `npm run sample:docs:graph` でサンプルの索引を再生成します。
4. `npm run sample:check` と `npm run docs:lint` を実行します。

図から `class ReservationId` を一時的に消すと `npm run sample:drift` が失敗します。
変更を戻せば成功します。図と実装を両方向に検査していることを体験できます。

## 範囲

これは学習用の仕様と CLI です。実サービスの予約要件ではありません。
画面・HTTP・認証・DB/RLS・在庫・料金・決済・イベント配信は未実装です。
テナント分離のテストはメモリ adapter 内の検査で、認可や RLS を代替しません。
同一テナント・同一 ID の save は更新となり、重複作成は拒否しません。

自分の案件への展開方法は [利用ガイド](../../docs/guides/02-booking-sample.md) にあります。
