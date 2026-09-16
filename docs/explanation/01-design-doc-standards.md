---
id: design-doc-standards
title: 設計書テンプレが参照した外部標準
type: explanation
kind: explanation
status: active
canonical: true
owners: [eng]
created: 2026-09-16
depends_on: []
relates_to: [docs-index]
---

# 設計書テンプレが参照した外部標準

> **TL;DR**: **設計書の背骨は arc42 12 章**。読みやすさの部分 (関連 ID・依存・README 索引) だけ独自に足す。
> - 採ったのは**節の構成と記法**であって、ツールチェーンではない (MADR CLI / spec-kit CLI は入れない)
> - spec-kit / Kiro からは **tasks テンプレだけ**残す。Google 流の design doc 1 枚方式は `docs/proposal/` (対外提案) の形として残す
> - 採らなかった部分は §2 に理由付きで書く。後から「標準に無いから」と足し戻さないため

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [文書体系](../../templates/docs/guides/01-document-taxonomy.md) | 全接頭辞 |
| 下流 | `templates/docs/**` / `scripts/check-doc-template.mjs` | — |

## 0. 背骨を arc42 にした理由

| 論点 | 決め | 理由 |
|---|---|---|
| 章立ての正典 | **arc42 12 章** | 「どの文書がどの関心事を担うか」を 12 個で固定でき、抜けが索引の空欄として見える。2005 年から使われ、商用利用も無償 |
| 章の表し方 | frontmatter `arc42: <1-12>`。フォルダは変えない | フォルダを章名にすると、1 文書が 2 章に跨るたびに移動が起きる。章は属性であって置き場所ではない |
| 独自に足すもの | 関連 ID (REQ/FN/SCR/API/TBL…)・`depends_on`・README 索引・行数上限 | arc42 は「何を書くか」しか決めない。追跡可能性と索引は自分たちで持つ必要がある |
| spec-kit / Kiro | **tasks テンプレのみ**採用 | 3 点セット (requirements / design / tasks) は本体系より粒度が粗く、1 文書の行数上限に収まらない |
| Google 流 design doc | `docs/proposal/` に限定 | 1 枚で背景〜設計〜代替案を書く形は**対外提案**には向くが、長期運用する設計書では更新点が散る |

## 1. 参照した外部標準

| 標準 | 採ったもの | 反映先 |
|---|---|---|
| [MADR 4.0](https://adr.github.io/madr/) | `Decision Drivers` / 冒頭「採用: <案>。理由:」/ `Confirmation` (決定が守られていることを機械で確かめる手段) | `templates/docs/adr/NNNN-__slug__.md` |
| [GitHub spec-kit](https://github.com/github/spec-kit) | tasks の行形式 `- [ ] T001 [P] [FN-001] 説明 (path)` と Setup / Foundational / User Story / Polish のフェーズ分け | `templates/docs/design/tasks/__feature__.md` |
| [AWS Kiro spec + EARS](https://kiro.dev/docs/specs/) / [EARS 原典](https://alistairmavin.com/ears/) | 機能要件を「<トリガ>のとき、システムは<応答>しなければならない」に固定し、パターン列 (Ubiquitous / Event / State / Unwanted / Optional) を持たせる | `templates/docs/product/01-requirements.md`、`check-doc-template.mjs` が REQ-1xx 行の義務形を検査 |
| [Diátaxis](https://diataxis.fr/) | tutorial / how-to / reference / explanation の 4 分類。`guides/` = how-to、`explanation/` = explanation、reference = 設計書本体 | `docs/guides/01-document-taxonomy.md` §2 の kind 分け |
| [arc42](https://arc42.org/overview) | §8 Crosscutting Concepts を独立文書にする (各機能の設計書に散らさない) | `templates/docs/design/basic/04-crosscutting.md` |
| [C4 model](https://c4model.com/) | L1 System Context / L2 Container / L3 Component / L4 Code を**図ごとに分ける**。1 枚に混ぜない | `architecture/01-overview.md` §2、`design/basic/08-infra-design.md` §1 |
| [OpenAPI as SoT](https://learn.openapis.org/best-practices.html) | 契約の正は OpenAPI 1 か所。Markdown の API 一覧は生成物 | `design/basic/api/__resource__.md` §1 の AUTOGEN 区間 |

## 2. 採らなかったもの

| 標準 | 採らなかった部分 | 理由 |
|---|---|---|
| MADR | ファイル名 `NNNN-title.md` 以外の運用 (`adr-tools` / MADR CLI) | 索引は `scripts/generate-docs-graph.mjs` が生成する。CLI を足すと索引の生成元が 2 つになる |
| spec-kit | `/specify` `/plan` `/tasks` のコマンド群と `spec.md` 1 枚方式 | 1 枚方式はIgeta の文書体系 (REQ → FN → SCR/API/TBL → CLS) と粒度が合わない。行形式だけ採る |
| Kiro | `requirements.md` / `design.md` / `tasks.md` の 3 点セット固定 | design.md 1 枚は 1 文書 200 行の上限に収まらない。分割済みの本体系を維持する |
| Diátaxis | tutorial の専用テンプレ | 学習者向け文書がまだ 1 本も無い。kind だけ予約し、必要になったら `guides/__slug__.md` を流用する |
| C4 | Component 図 (L3) の独立文書化 | モジュール仕様 (MOD) が同じ内容を文章で持つ。図は infra-design §1.2 内の小節に留める |

## 3. arc42 12 章の日本語解説

<!-- 英語名は arc42 公式 (https://arc42.org/overview/)、「一言で何を書くか」は公式の Contents を訳したもの -->

| 章 | 英語名 | 日本語名 | 一言で何を書くか | Igeta で担う文書 |
|---|---|---|---|---|
| §1 | Introduction and Goals | 導入と目標 | 機能要件の要約と、最重要の品質目標 (最大 5 つ)、ステークホルダー | `product/01-requirements.md` / `design/basic/01-function-list.md` |
| §2 | Constraints | 制約 | 設計・実装・プロセスの自由を縛る前提 (技術 / 組織 / 規約) | `product/01-requirements.md` の制約節 + `adr/` |
| §3 | Context and Scope | コンテキストと範囲 | システムの境界と、通信相手・外部インターフェースの全列挙 | `architecture/01-overview.md` §3 (AS-IS) / API 仕様 §6 |
| §4 | Solution Strategy | 解決戦略 | 技術選定・最上位分割・品質目標の達成手段を短く | `design/basic/02-solution-strategy.md` |
| §5 | Building Block View | 構成要素 | 静的な分解 (モジュール / クラス / データ構造) と依存関係。**唯一の必須章** | `design/detail/domain/` `modules/` / `design/basic/screens/` `api/` `tables/` |
| §6 | Runtime View | 実行時ビュー | 重要シナリオでの振る舞い。業務フロー・シーケンス・状態遷移・ジョブ | `design/basic/flows/` / `design/detail/sequences/` `state-machines/` `jobs/` |
| §7 | Deployment View | 配置ビュー | 実行環境と、構成要素のそこへの割り当て。環境ごとに書く | `design/basic/08-infra-design.md` / `design/ops/` |
| §8 | Crosscutting Concepts | 横断概念 | 複数の構成要素にまたがる方針 (認証・エラー・ログ・区分値・文言・権限) | `design/basic/04-crosscutting.md` `code-definitions.md` `messages.md` `permission-matrix.md` `09-i18n.md` |
| §9 | Architecture Decisions | アーキテクチャ決定 | 重要・高コスト・リスクの高い決定と根拠。形式は ADR | `adr/NNNN-*.md` |
| §10 | Quality Requirements | 品質要求 | 測定可能な品質シナリオと、その検証手段 | `design/basic/03-nonfunctional.md` / `design/test/` |
| §11 | Risks and Technical Debt | リスクと技術的負債 | 優先度順のリスク・負債と低減策。台帳の SoT は課題管理ツール | `design/01-risks-tech-debt.md` |
| §12 | Glossary | 用語集 | 関係者が使う業務・技術用語の定義 (ユビキタス言語) | `architecture/02-glossary.md` |

## 4. 日本の SI 用語との対応

<!-- 「基本設計書はどれですか」と聞かれたときに指す先を 1 行で決めておく -->

- **要件定義** = §1 導入と目標 + §2 制約 → `docs/product/01-requirements.md` (機能要件は EARS 記法)
- **基本設計 (外部設計)** = §3 コンテキスト + §4 解決戦略 + §5 の上位 (画面 / API / テーブル) + §7 配置 → `docs/design/basic/` と `docs/architecture/01-overview.md`
- **詳細設計 (内部設計)** = §5 の下位 (ドメインクラス図 / モジュール仕様) + §6 実行時ビュー + §8 横断概念 → `docs/design/detail/` と `docs/design/basic/04-crosscutting.md` 系
- **テスト設計** = §10 品質要求 → `docs/design/test/`
- **移行・運用設計** = §7 配置ビュー → `docs/design/ops/` と `docs/runbooks/`
- arc42 に「基本設計」「詳細設計」という区切りは無い。上の対応は**読み手の語彙に合わせるための写像**であり、章が正典
