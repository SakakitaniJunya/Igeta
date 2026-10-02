---
id: template-realignment
title: 雛形の組み直し — 人の決定と作り方を節の単位で分け、依存の向きを揃える
type: explanation
kind: explanation
status: active
canonical: true
owners: [eng]
created: 2026-10-02
depends_on: [folder-placement]
relates_to: [reader-granularity, context-boundaries]
---

# 雛形の組み直し — 人の決定と作り方を節の単位で分け、依存の向きを揃える

> **TL;DR**: いまの雛形は、kind の中に人の決定と作り方が混ざっている (例: インフラ設計に月額の費用、
> 状態遷移に 20 分の期限)。kind 単位の振り分けを正しくするため、**値の持ち主を 1 つにする**。
> 人が決める値は `person/` の kind の行に 1 回だけ書き、`ai/` の文書はその ID を引いて従う (値を書き写さない)。
> 新しい kind は足さない。予約だけの `data-management` は雛形を作る

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [どの文書をどこに置くか](./10-folder-placement.md) | — |
| 下流 | `templates/docs/**` の再編 (ADR-0005 決定 4) / [まとまりの境界](./07-context-boundaries.md) の改訂 (§4) | — |

## 1. `ai/` の雛形から `person/` へ移す値

| ai の kind | 移す値 (いまの節) | 移す先 (person) | ai に残すもの |
|---|---|---|---|
| infra-design | 月額の費用 (§5) | solution-strategy 新 §6「費用の上限」 | 構成・設定値・Secret・環境・経路と、上限に従う費用の内訳 |
| infra-design | 保持期間・越境 (§1.5)、環境ごとのデータの扱い (§1.6) | data-management | データの経路と暗号化 |
| crosscutting | ログの保持期間・個人情報の扱い (§3) | data-management | ログの必須項目と形式 |
| messages | 通知の宛先・タイミング・手段 (§2) | business-flow の決まりの行 | 文言 (用語集と nonfunctional §5 の方針に従う) |
| i18n | 対応ロケール (§1)・どの出口を多言語にするか (§4) | nonfunctional §5 | 文言カタログ・書式・翻訳の手順 |
| test-plan | 「リリース可」の条件 (§3) | migration-plan §2 の完了条件 | テストの層・環境・1 ステップの DoD・品質ゲート |
| state-machine | 期限・自動遷移の値 (§5。例: 仮押さえ 20 分) | business-flow の決まりの行 | 状態と遷移 (値は BF の ID を引く) |
| sequence-spec | 例外のとき業務としてどうするか (§3) | business-flow の例外の行 | 補償の処理と順序 |
| table-spec | 削除の方針 (§6)・バックアップ (§11) | data-management | 列・制約・索引 |
| code-definitions | 表示名 (§2) | glossary の語を引く | 区分値と格納形式 |
| external-integration (雛形なし) | どの外部サービスを使い、何を渡すか | solution-strategy §1 / data-management | 接続・認証・再送 |
| secrets-management (雛形なし) | 鍵の入れ替えの方針 | nonfunctional §3 | 置き場所と参照の方法 |

`data-management` の雛形 (新規): 持つデータの区分 / 個人情報 / 保持期間 / 越境 / 削除の求めへの対応 / 環境ごとの扱い。

## 2. `person/` の雛形から `ai/` へ出すもの

| person の kind | 出すもの (いまの節・列) | 出す先 (ai) |
|---|---|---|
| business-flow | 権限の技術的な中身 (§1)、入力・出力 (§3)、検知方法・システムの扱い (§4)、起動方式・冪等性 (§5) | sequence-spec / job |
| screen-spec | 画面項目の定義 (§3)、ローディングの形 (§4)、越境時の応答コード (§5) | 新しく文書にしない (コードが正本)。業務に効く制約だけ person の行に残す |
| function-list | 対応 API の列 | api-spec が FN を引く |
| solution-strategy | レイヤの依存の向き (§2)、品質目標の達成手段 (§3)、ADR 一覧 (§4) | crosscutting / test-plan。ADR 一覧は決定台帳が生成 |
| nonfunctional | 実装手段・検証方法 (§3)、測定方法 (§1) | crosscutting / test-plan |
| permission-matrix | 認証方法・権限の SoT (§1)、実装での担保 (§3)、越境時の応答 (§4) | crosscutting |
| operations | バックアップの方式 (§1)、監視の設定 (§2)、切り分け手順 (§3)、デプロイ手順 (§4) | runbook / infra-design |
| migration-plan | 手順と検証 (§3)、切戻しの手順 (§4) | runbook |
| glossary | 英語識別子の列 | domain-model |
| as-is-overview | 稼働中の資源の一覧 (§1) | infra-design |
| requirements | 雛形の例の HTTP 応答コード | 利用者から見える振る舞いに書き換える |

person に残るもの: operations は復旧の目標 (RPO/RTO)・障害時の影響と連絡と判断・人がやる定期作業。
migration-plan は対象・段階・完了条件・切戻しの条件 (数値)・関係者。as-is-overview は構成図と外部との契約。

## 3. 依存の向きを揃える (雛形の frontmatter)

| kind | いまの depends_on | 直した後 |
|---|---|---|
| operations (person) | nonfunctional, infra-design | nonfunctional, data-management |
| migration-plan (person) | table-spec, operations | operations, data-management |
| permission-matrix (person) | function-list, crosscutting | function-list |
| infra-design (ai) | nonfunctional | solution-strategy, nonfunctional, data-management, operations |
| crosscutting (ai) | nonfunctional | nonfunctional, permission-matrix, data-management |
| code-definitions (ai) | domain-model | domain-model, glossary |

- `relates_to` も向きの検査の対象にする。person の雛形の `relates_to` から ai の kind を外す
  (function-list・solution-strategy・nonfunctional・business-flow・screen-spec・permission-matrix・operations・migration-plan)
- person の雛形の「関連」の下流の欄は「(生成索引が出す)」と書く。空欄ではないので既存の `checkRelated` を通る
- context-map §3 は、隣のまとまりの約束 (ai) ではなく、隣のまとまりの地図 (person) を指す
- implementation-order は ai/handbook に移るので、domain-overview (ai) への依存はそのまま

## 4. まとまりの境界 (07) の改訂一覧

| # | いまの決め (07) | 改訂後 |
|---|---|---|
| 1 | まとまりはフォルダで表さない (§2) | フォルダでも表す。フィールドとフォルダ名の食い違いは違反 |
| 2 | kind はディレクトリの完全一致 + ファイル名のワイルドカードで決まる | まとまりの 1 段だけワイルドカードを許すパスの型にする (例: `person/design/*/flows/*.md`) |
| 3 | 共有の文書は kind の allowlist (`sharedKinds`) で決まる | `shared` のフォルダに置いた文書はどのまとまりからも引いてよい。`shared` の文書は特定のまとまりを引かない。`sharedKinds` の設定は次のメジャー版で廃止 (それまでは警告) |
| 4 | 他のまとまりへは約束 (contract) だけを引ける | 加えて、person の地図同士 (context-map → 隣の context-map) を許す |
| 5 | `context-files` は自分の文書 + 隣の約束 + map/glossary | 返す範囲: `person/requirements/` + `person/design/shared/` + `person/design/<まとまり>/` + `ai/specs/shared/` + `ai/specs/<まとまり>/` + 隣の `contract.md`。`person/decisions/`・`ai/handbook/`・`client/` は返さない |
| 6 | ai/handbook の文書 | 境界検査の対象外 (手引きで、設計ではない) |
