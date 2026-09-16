---
id: booking-sample-guide
title: 予約サンプルの実習手順 — 起動から変更・検査まで
type: guide
kind: guide
status: active
owners: [eng]
depends_on: [document-taxonomy]
relates_to: [start-here, project-roadmap]
---

# 予約サンプルの実習手順 — 起動から変更・検査まで

> **When to use**: [学習ロードマップ](00-start-here.md) の 1〜4 を実際に操作するとき。上から順に進めます。

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [文書体系](01-document-taxonomy.md) | document-taxonomy |
| 下流 | [予約サンプル](../../examples/booking/README.md) / [案件ロードマップ](03-project-roadmap.md) | REQ / FN / Reservation / TST |

## 1. 起動する

Node.js 22 以上と npm が必要です。まだ取得していない場合は次を実行します。

```bash
git clone --branch sample/booking-walkthrough https://github.com/SakakitaniJunya/Igeta.git igeta-booking-sample
cd igeta-booking-sample
```

取得済みなら、その `igeta-booking-sample` フォルダへ移動します。以下のコマンドはすべてそのルートで実行します。

```bash
node --version          # v22 以上であることを確認
npm ci                 # 初回、または package-lock.json が変わったとき
npm run sample:booking # 予約処理を実行
npm run sample:check   # 文書・型・テスト・図・依存を検査
```

**到達確認：** draft → confirmed → cancelled、再確定の拒否、別テナントの取得 `null`、最後に「サンプル完了」が表示され、検査も成功する。

## 2. 要件をコードまで追う

まず「予約を作る」という 1 機能だけを追います。各リンクを開き、右列の記述を探してください。

| 順 | 開くファイル | 探す記述・分かること |
|---|---|---|
| 1 | [要件定義](../../examples/booking/docs/product/01-requirements.md) | REQ-101：有効な ID を受けたら draft で作成する |
| 2 | [機能一覧](../../examples/booking/docs/design/basic/01-function-list.md) | FN-001：対応要件が REQ-101 になっている |
| 3 | [クラス図](../../examples/booking/docs/design/detail/domain/01-booking.md) | Reservation と保存用の ReservationRepositoryPort |
| 4 | [テスト仕様](../../examples/booking/docs/design/test/specs/01-booking.md) | TST-201：作成・取得した状態が draft になる |
| 5 | [demo.ts](../../examples/booking/demo.ts) | create.execute に tenantId と reservationId を渡す入口 |
| 6 | [booking.test.ts](../../examples/booking/booking.test.ts) | TST-201：仕様の期待結果を assert で確認する |

実行時の呼び出し順は次のとおりです。`npm run sample:booking` は `demo.ts` を起動します。

| 順 | 呼び出す処理 | 役割 |
|---|---|---|
| 1 | [demo.ts](../../examples/booking/demo.ts) → [CreateReservationUseCase.execute](../../examples/booking/src/modules/booking/application/use-cases/create-reservation.use-case.ts) | ID を渡す。時計と保存先は use case の生成時に注入済み |
| 2 | execute → [Reservation.create](../../examples/booking/src/modules/booking/domain/reservation.ts) | 入力を検証し、draft の集約を生成する |
| 3 | execute → [InMemoryReservationRepository.save](../../examples/booking/src/modules/booking/infrastructure/in-memory-reservation.repository.ts) | テナント別に保存し、作成結果を呼び出し元へ返す |
| 4 | demo.ts → findById → Reservation.transitionTo | 保存した予約を取得し、確定・キャンセル・禁止遷移を試す |

**到達確認：** draft の根拠を REQ-101、生成処理を Reservation.create、検証を TST-201 として指せる。

## 3. 検査を一度失敗させて戻す

1. [クラス図](../../examples/booking/docs/design/detail/domain/01-booking.md) をエディタで開き、`class ReservationId` の 1 行だけを消して保存します。
2. `npm run sample:drift` を実行します。ReservationId が実装にだけあるという不一致で失敗すれば、この段階は成功です。
3. エディタの「元に戻す」で消した行を戻して保存します。他の編集は消さないでください。
4. 再び `npm run sample:drift` を実行します。図 1 件・実装照合 1 件で成功することを確認します。

**到達確認：** 変更 → 失敗 → 復元 → 成功を確認できる。この演習ではコードの変更は不要です。

## 4. 変更後の確認

```bash
npm run sample:docs:graph # サンプルの文書索引を再生成
npm run sample:check      # サンプルの全検査
npm run docs:lint         # Markdown 記法
```

**到達確認：** すべて成功する。実際の仕様変更では要件 → 設計 → コード・テストの順に変更し、同じ検査を行います。
Igeta 自身の説明書（`docs/`）を編集した場合は、追加で `npm run docs:graph` → `npm run docs:check` → `npm run docs:template-check` を実行します。
自動生成の索引・依存グラフもコミット対象です。AUTOGEN 区間は直接編集しません。

## 5. 止まったとき・次に進むとき

| 症状 | 最初に確認すること |
|---|---|
| node/npm が見つからない、バージョンが古い | Node.js 22 以上の環境を用意し、§1 から再開 |
| Missing script / package.json がない | Igeta のルートにいるか、sample/booking-walkthrough ブランチか |
| tsx / tsc が見つからない | ルートで npm ci が成功したか |
| 図の検査が失敗する | §3 で消した行を戻したか。実際の変更なら図と実装の名前を比較 |
| 文書の参照切れ・索引のずれ | エラーに出たリンク先・ID を直し、sample:docs:graph → sample:check |

**実習完了。次は [案件ロードマップ](03-project-roadmap.md) の段階 1 で、自分の要件を 1 機能分書きます。**
