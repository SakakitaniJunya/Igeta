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
relates_to: [test-approval-gate, test-provenance-moves, test-person-form, test-doc-graph, test-review-sheet, test-init-scaffold, test-docs-migrate]
---

# 実装タスク — 確定させる人ごとのディレクトリ (文書モデル v4)

> **TL;DR**: 文書モデル v4 を動く状態にするまでの分解。順序は「詳細設計 (テスト仕様) の評価が通る → 実装 → コードレビュー → 統合」で、
> テスト仕様の表のテストが全部通ることが各タスクの受入条件
> - 1 タスク = 1 commit 相当。**チェックを付けるのは実装とテストが両方通ってから**
> - `[P]` は**別ファイルを触る**タスクにだけ付く。同じファイルを触るタスクは並列にしない

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [要件定義書 02](../../product/02-audience-directories.md) / ADR-0001〜0010 | REQ-101〜106 |
| 下流 | [テスト仕様 01〜07](../test/specs/) / 実装 | TST-* |

## Phase 1 Setup

- [x] T001 [audience-directories/REQ-102] 置き場所の表・構成の検出・置き場所と本数と入口の検査 (`src/core/Role.ts`・`src/checks/{RoleBoundaryCheck,FolderSizeCheck,AgentsEntrypointCheck}.ts`)
- [x] T002 [audience-directories/REQ-105] 指紋の正規化 v3 と載せ替え (`src/core/{Fingerprint,LinkTable,FingerprintRebase}.ts`・`src/generators/FingerprintRebaseModule.ts`)

## Phase 2 Foundational

- [ ] T010 [audience-directories/REQ-104] 雛形の再編を評価して統合する (person の雛形を人の型へ、ai の雛形の節の突き合わせ) (`templates/docs/**`・`src/core/LegacyTemplate*.ts`)
- [ ] T011 [P] [audience-directories/REQ-101] 承認の門: テスト仕様 01 の全部 (中身で見分ける処理を消す、持ち主の確かめ、`doctor` の違反) (`src/gate/**`・`src/cli/commands/DoctorCommand.ts`)
- [ ] T012 [P] [audience-directories/REQ-105] 行の移動と状態の列: テスト仕様 02 の全部 (`src/generators/{SourceMoveModule,FingerprintRebaseModule}.ts`・`src/core/AgreementLedger.ts`・`src/checks/AgreementCheck.ts`・`src/cli/commands/SourceMoveCommand.ts`)
- [ ] T013 [P] [audience-directories/REQ-103] 人の文書の型: テスト仕様 03 の表のうち、まだ無いテストを足す (`src/checks/PersonFormCheck.ts`)
- [ ] T014 [audience-directories/REQ-103] 文書のつながり: テスト仕様 04 の全部 (向き・届く・ADR の引用・索引・`nonDocPaths`・境界・読む範囲) (`src/checks/{DocGraphCheck,RoleBoundaryCheck,ContextBoundaryCheck}.ts`・`src/core/ContextGraph.ts`・`src/generators/ContextFilesModule.ts`)
- [ ] T015 [audience-directories/REQ-002] 変わった行の一覧: テスト仕様 05 の全部 (`src/generators/ReviewSheetModule.ts`・`src/cli/commands/ReviewSheetCommand.ts`)

## Phase 3+ User Story

### US-1 新しい repo を最初から 3 フォルダで起こす

- [ ] T100 [audience-directories/REQ-104] `init`・門のファイルの雛形・入口の 3 行・手引きの突き合わせ: テスト仕様 06 の全部 (`src/cli/commands/InitCommand.ts`・`src/generators/GateFilesModule.ts`・`src/core/Audience.ts`・`src/checks/AgentsEntrypointCheck.ts`・`templates/gate/**`)

### US-2 既存の repo を移す

- [ ] T200 [audience-directories/REQ-105] `docs-migrate`: テスト仕様 07 の全部 (`src/cli/commands/DocsMigrateCommand.ts`・`src/generators/DocsMigrate*.ts`)

### US-3 Igeta 自身を移す

- [ ] T300 [audience-directories/REQ-105] Igeta 自身に `docs-migrate` を適用する (移す段。完了条件を満たすこと) (`docs/**`・`AGENTS.md`・`.github/**`)
- [ ] T301 [audience-directories/REQ-002] 要件 2 本・解決戦略・地図を人の型へ書き直し、ADR-0001〜0010 を決まりの行から `ADR-NNNN` の形で引く (`docs/person/**`)
- [ ] T302 [audience-directories/REQ-101] Igeta 自身の `humanPaths` を、門が実行するものの全部 (`src/**`・`templates/**`・`package.json`・ロックファイル・`tsconfig.json`) と解説 03〜09 にする (`.igeta.json`)
- [ ] T303 [audience-directories/REQ-001] README に文書モデルを図で説明する (3 フォルダ・人の文書の型・承認の流れ・移行の手順・GitHub の設定の手順) (`README.md`)

## Polish

- [ ] T900 [audience-directories/REQ-205] 統合した全体のコードレビューと、指摘の反映 (`src/**`)
- [ ] T901 [audience-directories/REQ-106] 版を上げる (`package.json`・`.igeta-version`)

## 依存と並列

| 前提 | 後続 | 理由 |
|---|---|---|
| テスト仕様 01〜07 の評価が通る | T011〜T015・T100・T200 | 受入条件が決まる前に実装しない |
| T010 | T100・T200 | 雛形の置き場所と門の雛形が、`init` と `docs-migrate` の入力になる |
| T011 | T100 | 門の workflow と CODEOWNERS の雛形は、門の規則 (持ち主の確かめ) に合わせて作る |
| T012・T014 | T200 | `docs-migrate` は載せ替え・索引の再生成・置き場所の検査を呼ぶ |
| T013・T014・T015 | T300・T301 | 書き直す段の作業の列は、型と向きの検査が出す |
| T200 | T300 | Igeta 自身の移行は `docs-migrate` で行う |
| T300〜T303 | T900 | 全体のレビューは、Igeta 自身が新しい構成になってから行う |

**並列にしてよい組**: T011・T012・T013 (触るファイルが重ならない)。T014 と T015 は T013 と同じ作業場で順に行う

## 人の操作 (この文書のタスクの外)

- PR の merge と版のタグ打ち
- GitHub のブランチ保護の設定と、AI 用の GitHub アカウントの用意 (`igeta doctor` で確かめる。手順は T303 の README)
- ADR-0001〜0010 を `accepted` にする承認
- 利用 repo の版上げと移行 (それぞれの repo のタスク)
