---
id: sample-runbook-check-failure
title: Runbook — サンプルの検査が失敗したとき
type: runbook
kind: runbook
id_prefix: RUN
status: active
canonical: true
owners: [eng]
created: 2026-09-16
depends_on: [sample-infra-design]
relates_to: [sample-test-plan, booking-tests]
---

# Runbook — サンプルの検査が失敗したとき

> **When to use**: `npm run sample:check` か CI の `check` ジョブが失敗し、どれを直すか切り分けたいとき。

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [実行環境設計](../design/basic/08-infra-design.md) | INF-003 / INF-004 |
| 下流 | [テスト計画](../design/test/01-test-plan.md) / 復旧対象のサンプル一式 | TSP-101〜104 |

## 1. 判定

| ID | 症状 (出力の先頭) | 一致したら |
|---|---|---|
| RUN-001 | `NG  ...` / `TODO ...` (テンプレ適合・索引) | §2.1 へ |
| RUN-002 | `DRIFT ...` (図と実装の不一致) | §2.2 へ |
| RUN-003 | `not ok` / `✖ TST-...` (テスト失敗) | §2.3 へ |
| RUN-004 | `CONFIG ...` (検査不能 / exit 2) | §2.4 へ |
| RUN-005 | `error TS...` (型エラー) | §2.5 へ |

どれにも一致しない場合は、リポジトリのルートで実行しているか、`npm ci` が成功しているかを先に確認する。

## 2. 手順

### 2.1 文書の検査が落ちた

```bash
npm run sample:docs:graph   # 索引と依存グラフを再生成
npm run sample:docs:check   # 期待値: OK
```

生成物を直接編集した場合は再生成で戻る。`depends_on` の解決不能が出たら、参照先の frontmatter `id` を確認する。

### 2.2 図と実装がずれた

```bash
npm run sample:drift        # 期待値: 図 1 枚 / code_root 1 件
```

出力の `図にあるが実装に無い` / `実装にあるが図に無い` のどちらかを見て、クラス図か `domain/` の export を直す。片方だけ直して緑にしない。

### 2.3 テストが落ちた

```bash
npm run sample:test         # 期待値: pass 15 / fail 0
```

TST-214 か TST-215 が落ちた場合は、設計書の表と実装の定義がずれている。表を正とし、実装かコードの定義を合わせる。

### 2.4 検査不能 (exit 2) になった

検査できない状態を緑にしない。出力の `CONFIG` 行が原因を指す (テンプレが無い、`code_root` が無い、引数の値が無い)。
設定を直してから再実行する。

### 2.5 型エラーが出た

```bash
npm run sample:typecheck    # 期待値: 出力なし
```

## 3. エスカレーション

このサンプルは学習用で、当番や連絡先を持たない。原因が Igeta 本体の検査スクリプトにある場合は、`npm run test:scripts` を実行して切り分け、リポジトリの Issue に出力全文を添えて報告する。
