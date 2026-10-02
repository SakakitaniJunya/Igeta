---
id: test-approval-gate
title: テスト仕様 — 人の承認が要る変更の見分け (approval-scope・doctor)
type: design
kind: test-spec
arc42: 10
id_prefix: TST
status: draft
canonical: true
owners: [eng]
created: 2026-10-02
depends_on: [adr-0008-human-approval-scope]
relates_to: [adr-0002-role-boundary-invariants, test-init-scaffold]
---

# テスト仕様 — 人の承認が要る変更の見分け (approval-scope・doctor)

> **TL;DR**: 変更が「人の承認が要るパス」に触れたかを、パスだけで見分ける `approval-scope` と、GitHub の保護の設定を
> 読む `doctor` の詳細設計。この版が受け持つのは見分けと点検までで、PR の作者が検査を外す・偽ることは防がない
> (強制の門は次の版。ADR-0008)。前の実装にあった「中身で見分ける処理」は消す

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | ADR-0008 (決定 1〜3・6) | — |
| 下流 | `src/gate/*.ts`・`src/cli/commands/DoctorCommand.ts` とそのテスト | TST-* |

## 0. 規則

**宛先** = 変更を入れる先のブランチ。`--ci` では `origin/<GITHUB_BASE_REF>`、`--base <ref>` ではその ref。
**枝分かれの点** = 宛先の先端と HEAD の merge-base。

| # | 規則 |
|---|---|
| R1 | `approval-scope` は、枝分かれの点から変わった全部のパス (`git diff --name-status --no-renames -z --ignore-submodules=none`。移動は削除と追加の 2 行) を、ADR-0008 決定 1 の表と `humanPaths` に当てる。1 つでも当たれば `human`、当たらなければ `ai`。ファイルの中身は見ない。`--base` のときは、作業ツリーの変更と未追跡のファイルも含める |
| R2 | 構成 (新しい構成か) と `humanPaths` は、**宛先の先端**のツリー (`git ls-tree`・`git show <宛先>:.igeta.json`) から読む。作業ツリーと枝分かれの点の値は使わない (変更の作者が選べるものを信頼しない) |
| R3 | `--ci` と `--base <ref>` のどちらか 1 つが必須で、同時には指定できない |
| R4 | 次のどれかなら検査不能 (終了コード 2) で、`ai` を返さない: 宛先が決まらない (環境変数が無い・ref が無い・共通の祖先が無い・ref の名前が不正) / 宛先が旧い構成 / git の repo でない・`--root` が repo の最上位でない / 宛先の `.igeta.json` が読めない (壊れている・glob が不正) / 差分に知らない状態の文字がある |
| R5 | パスの照合は大文字と小文字を区別しない。`X/**` は `X` そのもの (ファイル・symlink・submodule) にも当たる。`**/AGENTS.md` は repo 直下にも当たる。名前の続き (`docs/personal/`) には当たらない |
| R6 | 終了コード: `ai` = 0 / `human` = 1 / 検査不能 = 2。標準出力の 1 行目は `human` か `ai`、続けて理由のパスを 1 行ずつ (`humanPaths` で当たったものは、その glob を添える) |
| R7 | `doctor` は、GitHub から既定ブランチの保護 (従来の保護と ruleset) を読み、次の 3 つを 1 つずつ出す: PR が必須 / CODEOWNERS の持ち主のレビューが必須 / 新しい push で承認を取り消す。3 つともそろえば適合 (0)、1 つでも欠ければ違反 (1)。GitHub が「この契約では使えない」と返したときも違反 (1)。`gh` が無い・権限が無くて読めないときは検査不能 (2)。管理者の迂回と必須の検査は、この版では確かめないことを出力に書く |

## 1. テストケース一覧

| ID | 層 | 対象 | 前提 (Given) | 操作 (When) | 期待結果 (Then) | 対応 |
|---|---|---|---|---|---|---|
| TST-101 | 結合 | approval-scope | 新しい構成の git repo | `docs/ai/` の文書だけ / `src/` のコードだけ / docs/ 直下の生成索引だけ / `package.json` とロックファイルだけ、を変える。差分が無い場合も | どれも `ai`・終了コード 0 | R1 |
| TST-102 | 結合 | 同上 | 同上 | `docs/person/` か `docs/client/` の文書を 1 本変える / `docs/ai/` と `docs/person/` を両方変える | `human`・1。理由は人のパスだけ | R1・R6 |
| TST-103 | 結合 | 同上 | 同上 | 決定 1 のファイルを 1 つずつ変える (`.github/workflows/x.yml`・`.github/actions/a/action.yml`・`.github/CODEOWNERS`・`CODEOWNERS`・`docs/CODEOWNERS`・`.igeta.json`・`.igeta-version`・`AGENTS.md`・`docs/ai/AGENTS.md`・`CLAUDE.md`・`.claude/settings.json`) | どれも `human` | R1・R5 |
| TST-104 | 結合 | 同上 | 宛先の `.igeta.json` に `humanPaths: ["src/core/**"]` | `src/core/a.ts` を変える | `human`・理由に glob | R1・R2・R6 |
| TST-105 | 結合 | 同上 | 枝を切った後で、宛先に `humanPaths: ["src/core/**"]` が足された | 古い枝で `src/core/a.ts` を変え、`--ci` | `human` (宛先の先端の設定で見る) | R2 |
| TST-106 | 結合 | 手元 | 新しい構成 | `docs/person/new.md` を作り `git add` しない / 追跡済みの人の文書を書き換えて commit しない | `--base` でどちらも `human` | R1 |
| TST-107 | 単体 | doctor | 3 つがそろった設定の応答 (従来の保護の形と ruleset の形) | 判定する | どちらも適合・0。出力に 3 つの項目と「確かめないこと」の行 | R7 |

## 2. 否定テスト (必須)

| ID | 観点 (手口・境界) | ケース | 期待結果 |
|---|---|---|---|
| TST-301 | 移動で逃がす | `docs/person/x.md` を `docs/ai/x.md` へ移す | `human` (削除の側のパスが当たる) |
| TST-302 | 大文字と小文字 | `docs/Person/x.md`・`.GitHub/workflows/x.yml` を足す | `human` |
| TST-303 | 構成を偽る | 宛先が旧い構成の repo で、変更が `docs/ai/x.md` を足す | 検査不能・2 |
| TST-304 | 設定を外す | 変更が `.igeta.json` から `humanPaths` を消し、そのパスを変える | `human` (理由は `.igeta.json` と、宛先の `humanPaths`) |
| TST-305 | 宛先の指定 | `--ci --base HEAD` / どちらも指定しない | 検査不能・2 |
| TST-306 | 宛先が無い | `--ci` で `GITHUB_BASE_REF` が無い / `origin/<名前>` が無い / 浅い clone で共通の祖先が無い / 名前が `-` で始まる | どれも検査不能・2 |
| TST-307 | 生成区間に書く | `docs/person/design/README.md` の生成区間の中に 1 行足す | `human` (README の例外は無い) |
| TST-308 | git の外 | git の repo でないフォルダ / `--root` が repo の最上位でない | 検査不能・2 |
| TST-309 | 名前だけのフォルダ | `docs/personal/x.md`・`docs/clients/x.md` を変える | `ai` |
| TST-310 | フォルダを差し替える | `docs/person` を symlink か submodule に置き換える | `human` |
| TST-311 | 設定が壊れている | 宛先の `.igeta.json` が JSON でない / `humanPaths` の glob が不正 | 検査不能・2 |
| TST-312 | doctor: 設定の欠け | 保護も ruleset も無い / 持ち主のレビューが任意 / 新しい push で承認を取り消さない、の 3 通り。GitHub が「この契約では使えない」と返す場合 | どれも違反・1 |
| TST-313 | doctor: 読めない | `gh` が無い / 権限が無くて設定を読めない | 検査不能・2 (成功にしない) |

## 3. トレーサビリティ

| 確認 | 結果 |
|---|---|
| ADR-0008 との対応 | 決定 1・3 = R1〜R6 / 決定 6 = R7 / 決定 4 (人のフォルダの生成物は人の文書だけから作る) は test-doc-graph/TST-306 / 決定 7 (AI は `仮` で起案) は機械で強制せず、`AGENTS.md` の雛形に書く (test-init-scaffold/TST-105) / CODEOWNERS の割り当ての点検は 06 の I14 |
| いまの実装との差 | R2: 現物は構成と `humanPaths` を作業ツリーから読む → 宛先の先端から読む / R4: 設定が壊れているとき 2 を返すのは現物どおり。知らない状態の文字は未対応 / R7: 現物は承認の数と持ち主のレビューだけを読み、欠けても警告で終了コード 0 → 3 項目を見て違反は 1 |
| 消す実装 | `src/gate/ManifestChange.ts`・`ReadmeIndexException.ts` と、その呼び出し・テスト (`ManifestChange.test.ts`・`ReadmeIndexException.test.ts`・`ApprovalScopeManifest.test.ts`・`ApprovalScopeReadme.test.ts`)。中身で見分ける処理は持たない |
| この版が保証しないもの | 変更の作者が CI の定義や npm scripts を書き換えて検査を外すこと / GitHub の保護を置けない契約の repo / 人と AI が同じアカウントを使う運用 / 移動のときに GitHub がどちらのパスで持ち主を決めるか。強制の門 (信頼できる版の Igeta で検査する workflow・持ち主の確かめ・`doctor` の残りの項目) は次の版で、安全面の評価の指摘を issue に残す (ADR-0008 決定 5) |

## 4. テストデータ (任意)

本物の git repo を一時フォルダに作る (既存の `ApprovalScopeFixture.ts`)。`doctor` は GitHub の応答を記録した JSON を使う。個人情報は無い。
