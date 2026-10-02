// 旧い構成 (docs/ 直下に person・ai・client が無い構成) の文書を検査する、雛形の必須節・行数上限・ID の接頭辞と形式の固定表。
//
// DocTemplateCheck は、kind ごとの雛形の必須節 (H2 見出し。連番を除き、`(任意)` の付かないもの)・frontmatter の
// line_limit・id_prefix (id_prefixes)・id_pattern で文書を検査する。雛形を新しい構成の木へ移して人の型へ作り直すと
// (ADR-0005 決定 4・ADR-0010)、これらが変わりうる。旧い構成の repo は版を上げてから移す (ADR-0005 決定 3) ので、
// 移すまでの間も既存の検査が通るよう、移す前の雛形の値を、ここに固定する (REQ-106)。旧い構成の置き場所の文書だけが
// この表で検査され、新しい構成の文書は雛形そのもので検査される。
//
// 値は、v0.4.0 の雛形 (templates/docs/ の 44 本) から起こした。表の全体は LegacyTemplateRules.test.ts が SHA256 で
// 固定する (値を 1 つ書き換えると落ちる)。v0.4.0 の雛形に当たらない値には直さない。旧い構成を違反にするメジャー版
// (ADR-0005 決定 1) で、この表は LegacyTemplatePaths.ts と一緒に要らなくなる。

/** ID の形式。numeric は PREFIX-nnn、bare-numeric は Tnnn、class-name は class 名そのもの (code_root が要る) */
export type LegacyIdPattern = 'numeric' | 'bare-numeric' | 'class-name';

export interface LegacyTemplateRule {
  /** 必須の H2 見出し。連番 (`1.`) を除いた文。文書の見出しは、これで始まっていればよい */
  readonly required: readonly string[];
  /** 行数上限。null なら上限なし */
  readonly lineLimit: number | null;
  /** ID の接頭辞。通常 1 個 (REQ)。decision-log は 2 個 (DEC・OPEN)。無い kind は空 */
  readonly idPrefixes: readonly string[];
  readonly idPattern: LegacyIdPattern;
}

const rule = (
  lineLimit: number | null,
  idPrefixes: readonly string[],
  required: readonly string[],
  idPattern: LegacyIdPattern = 'numeric',
): LegacyTemplateRule => ({ required, lineLimit, idPrefixes, idPattern });

/** kind → 旧い構成の文書の検査の値 (v0.4.0 の雛形の 44 kind) */
export const LEGACY_TEMPLATE_RULES: ReadonlyMap<string, LegacyTemplateRule> = new Map([
  ['map', rule(150, [], ['関連', '何を作るか', '誰が使うか', '主要フロー', 'やらないこと', '詳細への入口'])],
  ['decision-log', rule(null, ['DEC', 'OPEN'], ['関連', '決定 (DEC)', '未決 (OPEN)', '仮置き一覧 (自動生成)'])],
  ['adr', rule(null, [], ['関連', 'Status', 'Context', 'Decision Drivers', 'Decision', '却下した選択肢', 'Consequences', 'Confirmation', '再検討トリガ'])],
  ['as-is-overview', rule(null, ['ARC'], ['関連', '稼働中の構成', '構成図', '外部システムと契約'])],
  ['glossary', rule(null, [], ['関連'])],
  ['context-contract', rule(150, [], ['関連', '公開 API・イベント', '持っているデータ', '用語'])],
  ['context-map', rule(150, [], ['関連', '概要', '含む機能', '隣接まとまりへの入口'])],
  ['delivery-chapter', rule(null, [], ['関連'])],
  ['risks-tech-debt', rule(null, ['RSK'], ['関連', '技術リスク', '技術的負債'])],
  ['function-list', rule(null, ['FN'], ['関連', '機能一覧', '機能別の状態・権限', 'カバレッジ確認'])],
  ['solution-strategy', rule(null, ['SS'], ['関連', '技術選定の要約', '分割方針', '品質目標の達成手段', '主要な設計判断 (ADR 一覧)'])],
  ['nonfunctional', rule(null, ['NFR'], ['関連', '性能', '可用性', 'セキュリティ', '運用・監視閾値', '多言語・表示'])],
  ['crosscutting', rule(null, ['XC'], ['関連', '認証・認可', 'エラー形式', 'ログ・監査', 'i18n・タイムゾーン', '冪等性・リトライ', 'テナント隔離'])],
  ['code-definitions', rule(null, ['CD'], ['関連', '区分値一覧', '値の定義', '格納形式の方針'])],
  ['messages', rule(null, ['MSG'], ['関連', 'エラーメッセージ一覧', '通知テンプレート一覧', '送信失敗時の扱い', '文言の管理方針'])],
  ['permission-matrix', rule(null, ['PRM'], ['関連', 'ロール定義', 'ロール × 機能', 'データ範囲の定義', '越境が起きた時の応答'])],
  ['infra-design', rule(null, ['INF'], ['関連', '構成図', 'サービス設定値', 'Secret / 環境変数', '環境分離', '費用'])],
  ['i18n', rule(null, ['I18N'], ['関連', '対応ロケールと既定', '文言カタログ', 'ロケール依存の振る舞い', '適用範囲', '翻訳ワークフロー', '未翻訳・欠落時の挙動'])],
  ['api-spec', rule(null, ['API'], ['関連', 'API 一覧', '認可', 'エラー', '冪等性・再送', '外部インターフェース'])],
  ['business-flow', rule(null, ['BF'], ['関連', 'アクターと責務', '業務フロー図', 'フロー詳細', '例外系'])],
  ['screen-spec', rule(null, ['SCR'], ['関連', '画面一覧', '画面遷移図', '画面項目定義', '3 状態の定義', '権限と表示制御'])],
  ['table-spec', rule(null, ['TBL'], ['関連', 'ER 図', 'テーブル一覧', '列定義', '制約 (RLS / EXCLUDE / CHECK)', 'インデックス'])],
  ['domain-overview', rule(null, [], ['関連', 'コンテキストマップ', '図の規約', '未確定分岐'])],
  ['aggregate-map', rule(null, [], ['関連', '集約と境界', '集約の責務と不変条件'])],
  ['domain-model', rule(null, ['CLS'], ['関連', 'クラス図', '不変条件', 'クラス ↔ ファイル対応表', '差し替え可能点', '他コンテキストとの関係', '未決事項'], 'class-name')],
  ['job', rule(null, ['JOB'], ['関連', 'ジョブ一覧', '冪等性と再実行', '失敗時の扱い', '権限とデータ範囲'])],
  ['module-spec', rule(null, ['MOD'], ['関連', 'モジュール一覧', '公開面 (index.ts)', '依存', 'ポートと adapter の束ね'])],
  ['sequence-spec', rule(null, ['SEQ'], ['関連', 'ユースケース一覧', 'シーケンス図', '例外・補償', '発行イベントと購読'])],
  ['state-machine', rule(null, ['STM'], ['関連', '状態遷移図', '状態の定義', '遷移表', '不正遷移の扱い'])],
  ['operations', rule(null, ['OPS'], ['関連', 'バックアップ・復旧', '監視・アラート', '障害対応', 'デプロイ手順', '定期作業'])],
  ['migration-plan', rule(null, ['MIG'], ['関連', '移行対象', 'リリース段階', '手順と検証', '切戻し', '関係者と連絡'])],
  ['tasks', rule(null, ['T'], ['関連', 'Phase 1 Setup', 'Phase 2 Foundational', 'Phase 3+ User Story', 'Polish', '依存と並列'], 'bare-numeric')],
  ['test-plan', rule(null, ['TSP'], ['関連', 'テストピラミッド', 'テスト環境', 'Definition of Done', '品質ゲートと例外'])],
  ['test-spec', rule(null, ['TST'], ['関連', 'テストケース一覧', '否定テスト (必須)', 'トレーサビリティ'])],
  ['explanation', rule(null, [], ['関連'])],
  ['document-taxonomy', rule(null, [], ['関連', '章の関連図 (arc42)', '種類一覧', '配置の決定理由', '読み手 3 種 (kind → 読み手)'])],
  ['implementation-order', rule(null, [], ['関連', 'コンテキストの着手順 — 図から機械的に決める', '1 コンテキスト内の順番と DoD', '進む条件と戻る条件', '並列化できる単位', '各ステップで叩くコマンド'])],
  ['human-review', rule(null, [], ['関連', '読む順 (5〜10 分)', '機能ブリーフと未決の関門', '要件を直すときの手順', 'レビューシートの出し方', '整合レポート (`igeta analyze`)', '段階導入・移行の実測', '検査の限界 (機械が見ていないもの)'])],
  ['provenance-workflow', rule(null, [], ['関連', '手順', '由来を付け終えたら'])],
  ['guide', rule(null, [], ['関連'])],
  ['requirements', rule(null, ['REQ'], ['関連', '業務要件', '機能要件', '制約', '前提', 'スコープ外'])],
  ['feature-brief', rule(150, [], ['関連', 'WHAT/WHY', 'ユーザーストーリー', '対象外', '関わる REQ ID'])],
  ['proposal', rule(null, [], ['関連', '背景と課題', '調査結果', '選択肢の比較', '推奨案', '費用と期間', '前提と免責'])],
  ['runbook', rule(null, ['RUN'], ['関連', '判定', '手順', 'エスカレーション'])],
]);
