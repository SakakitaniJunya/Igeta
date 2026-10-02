---
id: <kebab-slug>            # 例: tasks-reservation
title: 実装タスク — <機能名>
type: design
kind: tasks
id_prefix: T
id_pattern: bare-numeric    # T001 形式 (ハイフン無し)。行頭のチェックボックスに 1 つずつ振る
status: draft
canonical: true
owners: [eng]
created: YYYY-MM-DD
depends_on: [function-list]
relates_to: [sequence-spec, test-spec]
---

# 実装タスク — <機能名>

> **TL;DR**: <この機能を動く状態にするまでの分解を 1 文で>
> - 1 タスク = 1 commit 相当。**チェックを付けるのは実装とテストが両方通ってから**
> - `[P]` は**別ファイルを触る**タスクにだけ付く。同じファイルを触るタスクは並列にしない

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [機能一覧](../basic/01-function-list.md) / [シーケンス](../detail/sequences/) / [テーブル定義](../basic/tables/) | FN-* / SEQ-* / TBL-* |
| 下流 | [テスト仕様](../test/specs/) / 実装 | TST-* |

<!--
  行形式: - [ ] T001 [P] [FN-001] 説明 (触るファイルのパス)
    - T001    連番。文書内で一意。振り直さない (完了後も番号を再利用しない)
    - [P]     並列実行可。**触るファイルが他タスクと重ならない場合のみ**付ける
    - [FN-001] 追跡する上流 ID。無いタスクは作らない (誰も頼んでいない作業になる)
    - (path)  触るファイル。書けないタスクは分解が足りない
  出典: GitHub spec-kit tasks-template / Kiro tasks.md
-->

## Phase 1 Setup

<!-- 依存の追加・設定・scaffold。ここが終わるまで他 Phase は始められない -->

- [ ] T001 [FN-000] <scaffold / 依存追加> (`<path>`)

## Phase 2 Foundational

<!-- 複数ユーザーストーリーが共有する土台 (schema / port / 共通エラー)。ここを飛ばすと後で全部書き直す -->

- [ ] T010 [FN-000] <共通基盤> (`<path>`)

## Phase 3+ User Story

<!-- ユーザーストーリーごとに H3 を切る。1 ストーリー完了ごとに動作確認できる粒度にする -->

### US-1 <ストーリー名> (FN-001)

- [ ] T100 [P] [FN-001] <ドメイン> (`<path>`)
- [ ] T101 [FN-001] <ユースケース> (`<path>`)

## Polish

<!-- 仕上げ。ここに「あとで直す」を積まない (原則: サイレント縮退禁止)。積むなら未決事項として上流へ返す -->

- [ ] T900 [FN-001] <ログ・監査・文言の整合> (`<path>`)

## 依存と並列

| 前提 | 後続 | 理由 |
|---|---|---|
| T001 | T010 | scaffold が無いと配置先が無い |

**並列にしてよい組**: <同じファイルを触らない T番号の組>
