---
id: project-roadmap
title: 自分の案件を進めるロードマップ
type: guide
kind: guide
status: active
owners: [eng]
depends_on: [document-taxonomy, booking-sample-guide]
relates_to: [start-here]
---

# 自分の案件を進めるロードマップ

> **When to use**: サンプルの実習を終え、自分の案件では何をどの順に作るか決めるとき。

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [実習手順](02-booking-sample.md) / [文書体系](01-document-taxonomy.md) | booking-sample-guide / document-taxonomy |
| 下流 | [案件へコピーする雛形](../../templates/README.md) / 自分の案件の設計書・実装・テスト | REQ → FN → class → TST |

## 1. 設計から運用までの順番

まず利用者の操作を 1 つ選び、段階 1〜5 を一巡します。例えば「予約を作成する」です。
表の文書は作成候補です。対象に画面がなければ画面設計は不要ですが、対象外である理由を要件に残します。
技術上の判断が必要になった段階で [ADR](../../templates/docs/adr/NNNN-__slug__.md) に理由を記録します。

| 段階 | 決めること・やること | 作るもの（リンクは雛形） | 次へ進む条件 |
|---|---|---|---|
| 1. 要件 | 誰が何のために使うか、成功と失敗、対象外 | [要件定義](../../templates/docs/product/01-requirements.md) | 1 機能の入力・結果・受入基準が具体的に書ける |
| 2. 基本設計 | 利用者から見える動きと品質・権限 | [機能一覧](../../templates/docs/design/basic/01-function-list.md)、[業務フロー](../../templates/docs/design/basic/flows/__flow__.md)、[非機能](../../templates/docs/design/basic/03-nonfunctional.md)、必要な画面・API・テーブル仕様 | 各機能が REQ に対応し、正常系と失敗時の振る舞いが決まる |
| 3. 詳細設計・テスト設計 | クラス・状態遷移・責務と検証方法 | [ドメイン図](../../templates/docs/design/detail/domain/__context__.md)、[状態遷移](../../templates/docs/design/detail/state-machines/__aggregate__.md)、[テスト計画](../../templates/docs/design/test/01-test-plan.md)、[テスト仕様](../../templates/docs/design/test/specs/__feature__.md) | FN → class → TST を追え、禁止操作の期待結果も書ける |
| 4. 実装 | 基盤と契約を用意し、雛形を展開して処理を実装 | 下記 §2 の順にコード・テストを作成 | 型・単体テスト・図↔実装・レイヤ依存が通る |
| 5. 結合・受入 | DB・外部 API・画面をつないで検証 | 結合・認可・主要導線のテスト、受入結果 | 実環境に近い条件で段階 1 の受入基準を満たす |
| 6. 運用準備 | 配置・監視・復旧・移行を決めて試す | [インフラ](../../templates/docs/design/basic/08-infra-design.md)、[運用設計](../../templates/docs/design/ops/01-operations.md)、[手順書](../../templates/docs/runbooks/__scenario__.md) | 起動・監視・復旧を担当者が手順で実施できる |

各段階で文書の必須節・参照・索引を検査します。文書検査の成功は、業務要件の妥当性や本番稼働の保証ではありません。

## 2. コードを書く順番

| 順 | 作業 | 確認すること |
|---|---|---|
| 0 | Node/TypeScript・テスト環境、API を作るなら入出力契約とアプリ基盤を用意 | 最小の起動・型検査・テストを実行できる |
| 1 | ID 等の値オブジェクト → 集約・状態遷移 → イベント・repository port | 正常系と禁止操作を単体テストでき、クラス図と一致する |
| 2 | application の use case を実装 | メモリ上の代替保存先だけでテストでき、エラー情報を検証できる |
| 3 | DB・外部サービスの adapter を実装 | 実 DB で制約・テナント分離・失敗時の挙動を検証できる |
| 4 | HTTP controller・認証認可を配線 | 契約と応答が一致し、権限のない要求を拒否できる |
| 5 | 画面を実装 | 正常・空・読み込み中・エラーを表示でき、主要導線が通る |

仕様不足が分かったら段階 1〜3 の該当文書へ戻り、文書 → コード → テストの順に直します。

## 3. サンプルの現在地

| 用意済み | これから案件ごとに作るもの |
|---|---|
| 段階 1〜3 の記入例：要件・機能・解決戦略・ドメイン・状態遷移・シーケンス・区分値・メッセージ・テスト計画・テスト仕様 | 実際の利用者の要件、画面設計・API 仕様・テーブル定義 |
| 段階 4 の一部：domain (2 集約)・application (3 use case)・メモリ adapter・15 テスト | API 契約、実 DB、HTTP、認証認可、画面 |
| 段階 6 の一部：実行環境設計・Runbook・ADR・リスクと技術的負債 | 実環境の配置・監視・移行、運用設計 |
| 図・表・文書・型・依存の自動検査 | 段階 5 の実環境での検証 |

`sample:check` が成功すれば、サンプルの学習範囲は完了です。次は段階 1 で自分の要件を作ります。

## 4. 今すぐ始める最初の作業

1. [雛形のコピー方法](../../templates/README.md) に従い、自分のリポジトリを用意します。
2. `templates/docs/product/01-requirements.md` を `docs/product/01-requirements.md` へコピーします。
3. 業務要件 `REQ-001`、機能要件 `REQ-101`、制約・前提・対象外を自分の案件の言葉で埋めます。
4. 機能一覧を作り、`FN-001` から `REQ-101` を参照します。文書間のリンク・ID も更新します。
5. 文書検査を通し、段階 2 の残りへ進みます。初回の索引生成は README が増えるため 2 回実行します。

```bash
# templates/・scripts/ をコピーした自分のリポジトリのルートで実行
node scripts/generate-docs-graph.mjs --write
node scripts/generate-docs-graph.mjs --write
node scripts/generate-docs-graph.mjs --check
node scripts/check-doc-template.mjs --require-kind
```

文書の名前や置き場所に迷ったときに [種類一覧](01-document-taxonomy.md#2-種類一覧) を参照します。
