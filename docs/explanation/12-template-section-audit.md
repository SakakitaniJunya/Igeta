---
id: template-section-audit
title: 雛形の節の監査 — ai の雛形の全部の節に置き場所の問いを当てた表
type: explanation
kind: explanation
status: active
canonical: false
owners: [eng]
created: 2026-10-02
depends_on: [audience-directories]
relates_to: [adr-0010-value-ownership, folder-placement]
---

# 雛形の節の監査 — ai の雛形の全部の節に置き場所の問いを当てた表

> **TL;DR**: ai の雛形の全部の節 (「関連」を除く) に、置き場所の問いを当てた。表 A (残した節) の「変わる」は 0 件。変わる値は person の行へ移した (表 B)
> - 答えが「変わる」なら、その値は人の承認が要るので person の行に置き、ai の節は ID を引く (ADR-0010)
> - 表 A は `TemplateSectionAudit.test.ts` が雛形の節と突き合わせる。雛形に節を足したら、この表に行を足す

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [要件定義書 — 確定させる人ごとのディレクトリ](../product/02-audience-directories.md) §7 | — |
| 下流 | (生成索引が出す) | — |

## 1. 問いと答え方

**問い (1 つだけ)**: 「AI がこれを勝手に変えたら、事業・お金・顧客との約束・使う人の体験・法令のどれかが変わるか」 (ADR-0001)。

- **変わる**: 人が承認した値 (金額・期間・率・期限・言語・権限・許す操作・利用者に見せる約束の文) を書き換えることになる。その値は `person/` の行へ移し、`ai/` の節は ID を引く
- **変わらない**: 実装の方式・構造・工程・生成物。`person/` の行に従って作る側で、値の持ち主ではない。節の列に「従う決まり」を持つものは、その ID を引く
- 実装の細部 (列名・HTTP コード・コマンド) の揺れは含めない。決めの内容が変わるかだけを見る

## 2. 表 A — 残した節 (雛形の全部の節。答えは全部「変わらない」)

「節」の欄に `;` で並べたものは、同じ理由で同じ答えの節をまとめた (連番と「(任意)」は外した)。person から ai へ出した値 (ADR-0010 決定 2) の受け皿の節は、理由に「受け皿」と書いた。

| kind | 節 | 答え | 移した先・理由 |
|---|---|---|---|
| 全 kind | 関連 | 変わらない | 上流・下流の文書の一覧 |
| crosscutting | 認証・認可 | 変わらない | 方式・判定の単位・越境時の応答の形。誰が何に触れられるかは権限マトリクス (PRM) の行を引く |
| crosscutting | エラー形式 ; 冪等性・リトライ ; テナント隔離 | 変わらない | 実装の方式 |
| crosscutting | ログ・監査 | 変わらない | 必須フィールドだけ。保持期間・個人情報の扱いは data-management へ移し、DM の行を引く |
| crosscutting | i18n・タイムゾーン | 変わらない | 方式の要約。対応する言語は nonfunctional (NFR) の行を引く |
| crosscutting | レイヤの依存の向き | 変わらない | 依存の向きの規則 (dependency-cruiser が強制する)。solution-strategy から外したレイヤの向きの受け皿 |
| crosscutting | 品質目標の達成手段 | 変わらない | 達成手段は方式。目標の数値は nonfunctional (NFR) の行を引く。solution-strategy から外した達成手段の受け皿 |
| code-definitions | 区分値一覧 ; 格納形式の方針 ; 表示名の解決 | 変わらない | 格納値と実装の分類 |
| code-definitions | 値の定義 | 変わらない | 格納値と意味。表示名は glossary の語へ移し、用語集の語を引く |
| messages | エラーメッセージ一覧 | 変わらない | 定型の文言のカタログ。約束・法令になる文は business-flow・screen-spec の行 (BF・SCR) を引く |
| messages | 通知の文言一覧 | 変わらない | 文言だけ。宛先・タイミング・手段は business-flow の通知の行へ移した |
| messages | 送信失敗時の扱い | 変わらない | リトライ・上限・記録だけ。失敗を利用者に見せるかは business-flow の例外 (BF-1xx) へ移した |
| messages | 文言の管理方針 | 変わらない | 実体の置き場所 |
| i18n | ロケールの表記と決まり方 ; 適用範囲 | 変わらない | 表記とロケールの取り方。対応する言語・多言語にする出口は nonfunctional へ移し、NFR の行を引く |
| i18n | 文言カタログ ; ロケール依存の振る舞い ; 翻訳ワークフロー ; 未翻訳・欠落時の挙動 | 変わらない | 実装の方式と工程。法的表記は business-flow の約束の文へ移した |
| infra-design | 構成図 | 変わらない | 配置・経路・権限の図。C4 の L1・L2 は solution-strategy へ、データの保持・越境は data-management へ移した |
| infra-design | サービス設定値 | 変わらない | 設定。solution-strategy の費用の上限 (SS) の範囲内で決める |
| infra-design | Secret / 環境変数 | 変わらない | 保管と参照。入れ替えの周期は nonfunctional (NFR) の行を引く |
| infra-design | 環境分離 | 変わらない | 環境の分け方。環境ごとのデータは data-management (DM) の行を引く |
| infra-design | ネットワーク・接続経路 | 変わらない | 経路の方式 |
| infra-design | バックアップと監視の設定 | 変わらない | 設定。保持と復旧の目標は data-management・operations、閾値は nonfunctional の行を引く。operations から外した方式・設定の受け皿 |
| infra-design | 稼働中の資源の一覧 | 変わらない | いま動いている資源の台帳。as-is-overview から外した一覧の受け皿 |
| test-plan | テストピラミッド ; 品質ゲートと例外 | 変わらない | 検証の手段と開発の工程 |
| test-plan | テスト環境 | 変わらない | 環境の種類。使うデータの個人情報の扱いは data-management (DM) の行を引く |
| test-plan | Definition of Done | 変わらない | 1 ステップの完了だけ。リリースしてよい条件は migration-plan へ移した |
| test-plan | 性能・負荷テスト | 変わらない | シナリオと負荷。合格の数値は nonfunctional (NFR) の行を引く |
| test-plan | 品質目標の測り方 | 変わらない | 測り方と道具。目標の数値は nonfunctional (NFR) の行を引く。nonfunctional から外した測り方の受け皿 |
| domain-overview | コンテキストマップ | 変わらない | 上流・下流と連携様式の図。分割の境界は solution-strategy (SS) が決める |
| domain-overview | 図の規約 ; 集約横断の論点 | 変わらない | 図の書き方と技術的な論点 |
| aggregate-map | 集約と境界 | 変わらない | トランザクション境界の図 |
| aggregate-map | 集約の責務と不変条件 | 変わらない | 業務の決まりに当たる不変条件は要件・業務フローの行 (REQ・BF) を引き、強制の仕方だけを書く |
| context-contract | 公開 API・イベント ; 持っているデータ ; 用語 | 変わらない | 他のまとまりに見せる技術的な契約 |
| api-spec | API 一覧 | 変わらない | OpenAPI から生成する (手で書かない) |
| api-spec | 認可 | 変わらない | 認証方式とテナント判定。誰が呼べるかは permission-matrix (PRM) の行を引く |
| api-spec | エラー ; ページング・ソート | 変わらない | HTTP の表現と一覧の取り方 |
| api-spec | 冪等性・再送 | 変わらない | 再送の方式。二重に課金しないなどの結果は要件 (REQ) が決め、ここは従う |
| api-spec | 外部インターフェース | 変わらない | 認証・タイムアウト・リトライ・契約の所在。使うサービスは solution-strategy (SS) を引き、障害時に縮退するかは business-flow へ移した |
| table-spec | ER 図 ; 列定義 | 変わらない | schema.prisma から生成する |
| table-spec | テーブル一覧 | 変わらない | 物理名と件数の見込み。保持期間は data-management (DM) の行を引く |
| table-spec | 制約 (RLS / EXCLUDE / CHECK) ; インデックス ; 中核 DDL 抜粋 ; 主要トランザクション ; 主要クエリ ; マイグレーション運用 ; 接続 ; 容量試算とスケール段階 | 変わらない | DB の実装手段。費用は solution-strategy の上限の範囲内。バックアップの保持は data-management へ移した |
| table-spec | 参照整合性 | 変わらない | 外部キーの動き。論理削除・削除の方針は data-management (DM) へ移し、行を引く |
| domain-model | クラス図 ; クラス ↔ ファイル対応表 ; 差し替え可能点 ; 他コンテキストとの関係 | 変わらない | 実装の構造 |
| domain-model | 用語の対応 | 変わらない | 用語集の語とクラス名の対応。表示名は用語集が持つ。glossary から外した英語識別子の受け皿 |
| domain-model | 不変条件 | 変わらない | 従う決まり (REQ・BF) の ID と、強制する主体・違反時の扱いだけ。決まりの内容は business-flow・requirements へ移した |
| sequence-spec | ユースケース一覧 ; シーケンス図 ; 発行イベントと購読 ; 外部サービス呼び出し | 変わらない | 実行時の構造 |
| sequence-spec | 例外・補償 | 変わらない | 検出・ロールバック・表現。業務としての扱いは business-flow の例外 (BF-1xx) へ移し、行を引く |
| state-machine | 状態遷移図 ; 不正遷移の扱い | 変わらない | 状態と、起こさせない仕組み |
| state-machine | 状態の定義 | 変わらない | 状態と意味。その状態で許す操作は business-flow (BF-3xx) へ移した |
| state-machine | 遷移表 | 変わらない | 遷移と技術的な副作用。条件は business-flow・requirements の行 (BF・REQ) を引く |
| state-machine | タイムアウト・自動遷移 | 変わらない | 起動主体と周期。期限は business-flow (BF-2xx) へ移した |
| module-spec | モジュール一覧 ; 公開面 (index.ts) ; 依存 ; ポートと adapter の束ね ; 切り出し可能性 | 変わらない | 実装の構造 |
| job | ジョブ一覧 | 変わらない | 実行の手段。期限は business-flow (BF-2xx) を引く |
| job | 冪等性と再実行 ; 権限とデータ範囲 | 変わらない | 実装の方式 |
| job | 失敗時の扱い | 変わらない | リトライと上限。通知先は nonfunctional (NFR) の監視の行へ移した |
| job | 観測 | 変わらない | 指標。閾値は nonfunctional (NFR) の行を引く |
| test-spec | テストケース一覧 ; 否定テスト (必須) ; トレーサビリティ | 変わらない | 検証の手段 |
| test-spec | テストデータ | 変わらない | 生成方法。個人情報の扱いは data-management (DM) の環境ごとの行を引く |
| tasks | Phase 1 Setup ; Phase 2 Foundational ; Phase 3+ User Story ; Polish ; 依存と並列 | 変わらない | 作業の分解。「あとで直す」は積まず、人の決めが要るものは person の「決めてほしいこと」へ返す |
| guide | 手順 | 変わらない | 作業の手順。決まりは書かない (手引きの定義) |
| explanation | 調査・背景 | 変わらない | 決定の材料。決定そのものは ADR (person) に書く |
| runbook | 判定 ; 手順 ; 事後 | 変わらない | 復旧の手順 |
| runbook | エスカレーション | 変わらない | 連絡先・期限は operations (OPS-1xx) の行を引く |
| implementation-order | コンテキストの着手順 — 図から機械的に決める ; 1 コンテキスト内の順番と DoD ; 進む条件と戻る条件 ; 並列化できる単位 ; 各ステップで叩くコマンド | 変わらない | 作る順番。ドメイン総論の図から機械的に決まる |
| document-taxonomy | 3 つのフォルダ — 確定させる人で分ける ; kind の置き場所 (正本は Igeta の要件定義書 02 §7) ; 名前の付け方 ; person の文書の型 ; kind の内容・ID 接頭辞・arc42 の章・上限 ; 依存の向き ; 書き方の指示 (person・client の雛形から移した) ; Igeta の手引きの置き場所 | 変わらない | Igeta の版に固定した手引き (利用 repo の AI は書き換えない)。置き場所は要件 02 §7 の転記で、`TaxonomyGuideSync.test.ts` が見る |
| human-review | 読む順 (5〜10 分) ; 機能ブリーフと未決の関門 ; 要件を直すときの手順 ; レビューシートの出し方 ; 整合レポート (`igeta analyze`) ; 段階導入・移行の実測 ; 検査の限界 (機械が見ていないもの) | 変わらない | Igeta の版に固定した手引き (利用 repo の AI は書き換えない) |
| provenance-workflow | 手順 ; 由来を付け終えたら | 変わらない | Igeta の版に固定した手引き (利用 repo の AI は書き換えない) |

## 3. 表 B — 変わるので person へ移した値

ADR-0010 決定 1 の表に、節ごとに当てて見つけた値 (送信失敗の見せ方・認可の条件・障害時の縮退・合格の数値・決済情報の保存・通知先と閾値・法的表記) を足した。ID は移した先の行の接頭辞と番号の帯 (`x` は任意の数字)。

| 元の kind | 元の節・値 | 変わるもの | 移した先 (person) |
|---|---|---|---|
| infra-design | 費用 (月額) | お金 | solution-strategy「費用の上限」(SS-2xx) |
| infra-design | 構成図の C4 L1・L2 (利用者・外部・コンテナ) | 事業 (何と繋がるか) | solution-strategy「構成の図」 |
| infra-design | データフロー図の保持期間・越境・個人情報 | 法令 | data-management (DM-1xx・DM-2xx・DM-3xx) |
| infra-design | 環境別の差分・環境分離のデータ | 法令・お金 | data-management「環境ごとの扱い」(DM-5xx) |
| infra-design | 決済情報を自システムに保存しない | 法令 | data-management (DM-0xx「自システムに保存するか」) |
| infra-design | Secret の入れ替えの周期 | 顧客との約束・法令 | nonfunctional (NFR-2xx) |
| crosscutting | ログ・監査の保持期間・個人情報の扱い | 法令 | data-management (DM-1xx・DM-2xx) |
| table-spec | テーブル一覧の保持期間 | 法令 | data-management「保持期間」(DM-2xx) |
| table-spec | 削除の方針 (論理削除の有無) | 法令・顧客との約束 | data-management「削除の求めへの対応」(DM-4xx) |
| table-spec | バックアップ | お金・法令 | data-management (DM-2xx)・operations「復旧の目標」(OPS-0xx) |
| test-plan・test-spec | テストデータの個人情報の扱い | 法令 | data-management「環境ごとの扱い」(DM-5xx) |
| test-plan | リリースしてよい条件 | 顧客との約束・事業 | migration-plan「リリースしてよい条件」(MIG-2xx) |
| test-plan | 性能・負荷テストの合格の数値 | 顧客との約束 | nonfunctional (NFR-0xx) |
| messages | 通知の宛先・タイミング・手段 | 顧客との約束・体験 | business-flow「フロー詳細」「例外系」の通知の列 (BF-0xx・BF-1xx) |
| messages | 約束や法令になる文 (規約・キャンセル規定・料金の表示・同意の文) | 顧客との約束・法令 | business-flow「利用者への約束」(BF-4xx)・screen-spec「画面に出す約束の文」(SCR-3xx) |
| messages | 送信失敗を利用者に見せるか | 体験 | business-flow「例外系」の業務上の扱い (BF-1xx) |
| i18n | 対応する言語・既定・多言語にする出口 | 事業・体験 | nonfunctional「対応する言語・表示」(NFR-4xx) |
| i18n | 法的表記・規約 | 法令 | business-flow「利用者への約束」(BF-4xx) |
| state-machine・sequence-spec・domain-model・aggregate-map | 業務の決まりに当たる期限・許す操作・例外の扱い・不変条件 | 顧客との約束・体験 | business-flow「時間で動く業務」(BF-2xx)・「段階ごとに許す操作」(BF-3xx)・「例外系」(BF-1xx)・requirements |
| code-definitions | 表示名 | 体験 | glossary の語 |
| api-spec | 認可の条件 (ロールごとの可否) | 顧客との約束・事業 | permission-matrix「ロール × 機能」(PRM-2xx) |
| api-spec | 外部サービスの障害時に縮退するか | 体験・顧客との約束 | business-flow「例外系」(BF-1xx) |
| job | 通知先・正常の閾値 | 顧客との約束 | nonfunctional「運用・監視の閾値」(NFR-3xx) |
| external-integration (雛形なし) | 使う外部サービスと渡すもの | 事業・法令 | solution-strategy「使う外部サービス」(SS-3xx)・data-management |
| secrets-management (雛形なし) | 鍵の入れ替えの方針 | 顧客との約束・法令 | nonfunctional (NFR-2xx) |
| domain-overview・domain-model・i18n | 未確定の分岐・ヒアリング項目の追加提案・未決事項 | (人の決めが要る) | person の「決めてほしいこと」(solution-strategy・requirements・nonfunctional) |

## 4. 確かめ方

| 手段 | 見るもの | 落ちる条件 |
|---|---|---|
| `TemplateSectionAudit.test.ts` | 表 A と ai の雛形の節 | 雛形の節が表 A に無い・表 A にあって雛形に無い・「変わらない」以外の答えがある・「変わる」が 1 件でもある |
| `TemplatesInstantiation.test.ts` | 雛形の全部を置いた repo の見出し (本物の `RoleBoundaryCheck`) | ai の雛形に「未決」「未確定」などの語の節がある (ADR-0002 条件 11) |
| `TemplatesTree.test.ts` | ai/specs/ の雛形の `depends_on` | 辿っても `person/` に届かない (ADR-0002 条件 4) |
