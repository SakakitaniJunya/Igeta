---
id: tasks-v4-rollout
title: 実装タスク — 確定させる人ごとのディレクトリ (文書モデル v4)
type: design
kind: tasks
id_prefix: T
id_pattern: bare-numeric
status: draft
canonical: true
owners: [eng]
created: 2026-10-02
depends_on: [audience-directories]
relates_to: [test-approval-gate, test-person-form, test-doc-graph, test-review-sheet, test-init-scaffold, test-docs-migrate]
---

# 実装タスク — 確定させる人ごとのディレクトリ (文書モデル v4)

> **TL;DR**: 文書モデル v4 を動く状態にするまでの分解。順序は「詳細設計 (テスト仕様) の評価が通る → 実装 → コードレビュー → 統合」
> - 受入条件は、テスト仕様の表の行が全部通ること。**テストは表の行に対応させる。表に無いテストは足さず、置き換える実装のテストは置き換える**
> - 1 タスク = 1 commit 相当。チェックを付けるのは実装とテストが両方通ってから。`[P]` は別のファイルを触るタスクにだけ付く

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [要件定義書 02](../../product/02-audience-directories.md) / ADR-0001〜0010 | REQ-101〜106 |
| 下流 | [テスト仕様 01・03〜07](../test/specs/) / 実装 | TST-* |

## Phase 1 Setup

- [x] T001 [audience-directories/REQ-102] 置き場所の表・構成の検出・置き場所と本数と入口の検査 (`src/core/Role.ts`・`src/checks/{RoleBoundaryCheck,FolderSizeCheck,AgentsEntrypointCheck}.ts`)
- [x] T002 [audience-directories/REQ-105] 指紋の正規化 v3 と載せ替え (`src/core/{Fingerprint,LinkTable,FingerprintRebase}.ts`・`src/generators/FingerprintRebaseModule.ts`)

## Phase 2 Foundational

- [ ] T010 [audience-directories/REQ-104] 雛形の再編 (branch `feat/v4-templates`) を、コードレビューの指摘の直しの後に統合する (`templates/docs/**`・`src/core/LegacyTemplate*.ts`・`src/checks/DocTemplateCheck.ts`)
- [ ] T011 [P] [audience-directories/REQ-101] 見分け: テスト仕様 01 の全部。中身で見分ける処理とそのテストを消し、設定を宛先の先端の内容から読み (作業ツリーのファイルを開かない)、`doctor` を 4 項目にする (`src/gate/**`・`src/cli/commands/DoctorCommand.ts`・`src/core/IgetaConfig.ts`)
- [ ] T012 [P] [audience-directories/REQ-105] 行の移動の付け替えと状態の列の載せ替えを、この版から外す (ADR-0006 決定 7)。書く側 (`SourceMoveModule` の全部・`stateColumnRows`・`decideStateColumnRebase`) と、台帳を読む側 (`source-move` の行の受け付け・`sourceRedirects`・`followRedirect`) と、そのテストと、解説 08 の記述。受入: `source-move` の行を手で足した台帳は検査不能になる (`src/generators/{SourceMoveModule,FingerprintRebaseModule}.ts`・`src/core/{AgreementLedger,FingerprintRebase}.ts`・`src/checks/AgreementCheck.ts`・`docs/explanation/08-agreement-ledger.md`)
- [ ] T013 [audience-directories/REQ-103] 人の文書の型 (branch `feat/v4-person`) を T010 の後に統合し、テスト仕様 03 に合わせる。`DocTemplateCheck.ts` は T010 と重なるので、重なりをここで解く (`src/checks/{PersonFormCheck,DocTemplateCheck}.ts`・`src/core/{DecisionRows,MarkdownTable,GitRef}.ts`・`src/cli/commands/checkCommands.ts`)
- [ ] T014 [audience-directories/REQ-103] 文書のつながり: テスト仕様 04 の全部。旧い構成の警告の文は、0.5.0 では「移行コマンドは次の版で入る」にする (`src/checks/{DocGraphCheck,RoleBoundaryCheck,ContextBoundaryCheck}.ts`・`src/core/ContextGraph.ts`・`src/generators/{ContextFilesModule,ContextSizeModule}.ts`)
- [ ] T015 [audience-directories/REQ-002] 変わった行の一覧: テスト仕様 05 の全部 (`src/generators/ReviewSheetModule.ts`・`src/cli/commands/ReviewSheetCommand.ts`)

## Phase 3+ User Story

### US-1 新しい repo を最初から 3 フォルダで起こす

- [ ] T100 [audience-directories/REQ-104] `init`・承認の割り当てのファイルの作り手・入口の 3 行・手引きの突き合わせ: テスト仕様 06 の全部 (`src/cli/commands/{InitCommand,ScaffoldCommand}.ts`・`src/generators/{ApprovalFilesModule,ScaffoldModule}.ts`・`src/core/Audience.ts`・`src/checks/{AgentsEntrypointCheck,DomainDiagramDriftCheck,DocTemplateCheck}.ts`・`templates/docs/README.md`)

### US-2 既存の repo を移す

- [ ] T200 [audience-directories/REQ-105] `docs-migrate`: テスト仕様 07 の全部。旧い構成の警告の文を「`igeta docs-migrate` を実行する」に戻す (`src/cli/commands/DocsMigrateCommand.ts`・`src/generators/DocsMigrate*.ts`)

### US-3 Igeta 自身を移す

- [ ] T300 [audience-directories/REQ-105] Igeta 自身に `docs-migrate` を適用する (移す段。完了条件を満たすこと) (`docs/**`・`AGENTS.md`・`.github/CODEOWNERS`)
- [ ] T301 [audience-directories/REQ-002] 要件 2 本・解決戦略・地図を人の型へ書き直し、ADR-0001〜0010 を決まりの行から `ADR-NNNN` の形で引く。ADR の本文から `ai/` の文書へのリンクを外す (`docs/person/**`)
- [ ] T302 [audience-directories/REQ-101] Igeta 自身の `humanPaths` を、検査として実行されるものの全部 (`src/**`・`templates/**`・`package.json`・ロックファイル・`tsconfig.json`) と解説 03〜09 にする (`.igeta.json`)
- [ ] T303 [audience-directories/REQ-001] README に「文書モデル」の節を書く。Mermaid の図 3 枚 (3 フォルダと確定させる人 / 人の文書の型 / 変更から承認までの流れ) と、3 つの小節 (置き場所の決め方 / 人の文書の書き方 / GitHub の保護の設定と、この版が保証しないこと)。CI で `template-check --base` と `approval-scope --ci` を呼ぶ書き方を書き、PR の作者の内容を特権のある CI (`pull_request_target`) で読む構成は勧めない。旧い構成と v3 の構成の repo を移すコマンドは 0.6.0 から、と書く。`igeta mermaid-check README.md` と `docs:lint` が通る (`README.md`)
- [ ] T304 [audience-directories/REQ-105] README に「既存の repo を移す」の小節 (移す段と書き直す段の手順) を足す (`README.md`)

## Polish

- [ ] T900 [audience-directories/REQ-205] 版ごとに、統合した全体のコードレビューと、指摘の反映 (`src/**`)
- [ ] T901 [audience-directories/REQ-106] 版を上げる (1 本目は 0.5.0、2 本目は 0.6.0)。メジャー版は上げない (合計字数の上限と旧い構成は警告のまま) (`package.json`・`.igeta-version`)
- [ ] T902 [audience-directories/REQ-205] テストの整理: 同じ規則を同じ層で重ねて確かめるテストを表形式の 1 本にまとめ、テスト仕様の表の行にも ADR-0002 の条件にも対応しないテストを消す。雛形の性質を別のコードで書いたテストは、本物の検査を雛形に当てる 1 本に置き換える (`src/core/{Role,Codeowners,IgetaConfig}.test.ts`・`src/checks/{RoleBoundaryCheck,AgentsEntrypointCheck,FolderSizeCheck,DocsCheck,Templates*}.test.ts`)

## 依存と並列

| 前提 | 後続 | 理由 |
|---|---|---|
| テスト仕様 01・03〜07 の評価が通る | T011〜T015・T100・T200 | 受入条件が決まる前に実装しない |
| T010 | T013 | 2 つの branch が `DocTemplateCheck.ts` を別々に書き換えている。雛形を先に入れ、人の文書の型を後から重ねる |
| T013 | T014・T015 | ADR の索引の置き場所 (`DocGraphCheck.ts`) の変更と、決まりの行の読み方・git の読み出し (`DecisionRows`・`GitRef`) が `feat/v4-person` にある |
| T010・T013・T014 | T100 | `init` の受入 (置いた直後に全部の検査が通る) は、雛形・人の文書の型・索引の検査を使う |
| T100・T013・T014 | T200 | 承認の割り当てのファイルの作り手と入口の 3 行は T100。書き直す段の作業の列は T013・T014 の検査が出す |
| T200 | T300 | Igeta 自身の移行は `docs-migrate` で行う |
| T300 | T301 → T302 → T304 | 同じ `docs/**` と repo 直下を触るので、順に行う |
| T100 | T303 → T304 | README の図解は、`init` が置くものと検査の実際の振る舞いに合わせて書く。T304 は同じ `README.md` を後から触る |
| 版に入るタスクの全部 | T900 → T901 | 版ごとに、全体のレビューの後で版を上げる |
| T014・T100 | T902 | 同じテストのファイル (`RoleBoundaryCheck.test.ts`・`AgentsEntrypointCheck.test.ts`) を触る |

**並列にしてよい組**: T011・T012 (触るファイルが重ならない)。T010 → T013 → T014 は順に行い、T015 は T013 の後。
**共有のファイル**: `src/cli.ts` (コマンドの登録) と `src/checks/DocsCheck.ts` (検査の並び) は、各タスクが 1 行ずつ足す。統合は、0.5.0 が T010 → T013 → T014 → T011・T012・T015 → T100、0.6.0 が T200 → T300 の順に取り込み、重なりはそのつど解く

## 版の区切り

| 版 | 入るタスク | この版で見えるもの |
|---|---|---|
| 0.5.0 (1 本目の PR) | T010〜T015・T100・T303・T900・T901 | 新しい構成の雛形と検査、見分け、変わった行の一覧、`init`、README の図解 |
| 0.6.0 (2 本目の PR) | T200・T300〜T302・T304・T902・T900・T901 | 移行コマンド、Igeta 自身の移行 |

## この文書のタスクの外

- **次の版**: 強制の門 (ADR-0008 決定 5) / 行の移動の付け替えと状態の列の載せ替え (ADR-0006 決定 7)。安全面の評価の指摘は issue に残す
- **人の操作**: PR の merge と版のタグ打ち / ADR-0001〜0010 を `accepted` にする承認 / GitHub の保護の設定と AI 用の GitHub アカウントの用意 (`igeta doctor` で確かめる) / 利用 repo の版上げと移行 (それぞれの repo のタスク)
