---
id: test-approval-gate
title: テスト仕様 — 人の承認の門 (approval-scope・doctor・雛形)
type: design
kind: test-spec
arc42: 10
id_prefix: TST
status: draft
canonical: true
owners: [eng]
created: 2026-10-02
depends_on: [adr-0008-human-approval-scope]
relates_to: [adr-0002-role-boundary-invariants]
---

# テスト仕様 — 人の承認の門 (approval-scope・doctor・雛形)

> **TL;DR**: 人の承認の門の詳細設計。信頼の根は GitHub の設定と起点側の内容だけで、PR が書き換えられるものを信頼しない。
> 想定する相手は PR の作者 (AI)。§0 が規則、§1 が正常の事例、§2 が門を抜けようとする手口と境界の事例。
> 実装の受入条件は、この表のテストが全部通ること。判定はパスだけで行い、中身で見分ける処理は消す

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | ADR-0008 (人の承認の門) | 決定 1〜6 |
| 下流 | `src/gate/*.test.ts` / `init`・`docs-migrate` が置く `.github/workflows/igeta-gate.yml` と `.github/CODEOWNERS` | TST-* |

## 0. 規則

**信頼するもの**: GitHub のブランチ保護の設定 / 起点 (merge-base) のツリー / 起点の `.igeta-version` が指す版の Igeta。
**信頼しないもの**: PR の head のすべて (コード・`package.json`・ロックファイル・`.npmrc`・`node_modules`・workflow の定義)。

| # | 規則 |
|---|---|
| R1 | `approval-scope` は `git diff --name-status --no-renames -z <起点>` の全部のパス (移動は削除と追加の 2 行) と未追跡のファイルを、ADR-0008 決定 1 の表と `humanPaths` に当てる。1 つでも当たれば `human` |
| R2 | 構成 (新しい構成か) と `humanPaths` は、起点のツリー (`git ls-tree`・`git show <起点>:.igeta.json`) から読む。作業ツリーの値は使わない |
| R3 | 起点は、`--ci` では `origin/<GITHUB_BASE_REF>` と HEAD の merge-base。`--base <ref>` は手元の確認用。どちらか 1 つが必須で、同時には指定できない |
| R4 | 起点が決まらない・起点が旧い構成・git の repo でない、のどれかなら検査不能 (終了コード 2)。`ai` を返さない |
| R5 | パスの照合は大文字と小文字を区別しない。`X/**` は `X` そのもの (ファイル・symlink) にも当たる。`**/AGENTS.md` は repo 直下にも当たる |
| R6 | 終了コード: `ai` = 0 / `human` = 1 / 検査不能 = 2。標準出力の 1 行目は `human` か `ai`、続けて理由のパス |
| R7 | `--ci` で `human` のとき、人のパスの 1 つ 1 つに GitHub が持ち主のレビューを求めることを、起点の CODEOWNERS (GitHub が読む順で最初の 1 つ。大文字と小文字を区別し、最後に当たった行を使う) で確かめる。(a) 追加・変更のパスは、持ち主が付くこと。(b) 削除のパスは、持ち主が付き、かつ「PR に追加が 1 つも無い」か「追加・変更のパスのどれかに、その持ち主の全員または一部だけが付く」こと。満たさないパスが 1 つでもあれば検査不能 (2) |
| R8 | `doctor` は GitHub から読んだ設定が ADR-0008 決定 2 の (a)〜(e) と「持ち主が有効」を満たさなければ違反 (1)、読めなければ検査不能 (2) |
| R9 | 門の workflow の雛形は W1〜W9 を満たす (下の表) |

R7 (b) の理由: GitHub が削除と追加を「移動」と見なしたとき、移した先のパスだけで持ち主を決める可能性がある (文書に書かれていない)。
追加のどれが組になっても持ち主のレビューが求められる形だけを通す。

| # | 門の workflow の性質 |
|---|---|
| W1 | `pull_request_target` だけで動く (定義は起点側のものが使われる) |
| W2 | 権限は `contents: read` だけ |
| W3 | PR の head は `persist-credentials: false` で下位のフォルダに取り、履歴を全部取る |
| W4 | Igeta は起点のツリーの `.igeta-version` の版を `$RUNNER_TEMP` の下に入れる (Igeta 自身の repo は、起点を別のフォルダに取って build する) |
| W5 | PR のフォルダの中で `npm ci`・`npm install`・`npm run`・`npx` を実行せず、PR のフォルダの中のファイルを実行しない |
| W6 | action は commit の SHA で固定する |
| W7 | `approval-scope --ci` の終了コード 1 では失敗にせず、2 で失敗にする |
| W8 | W4 の Igeta で、PR のフォルダを対象に `docs-check` と `template-check --require-kind --require-human-review --base <起点>` を実行し、違反なら失敗にする。`review-sheet --diff` の出力を job の要約に書く |
| W9 | `${{ }}` の式を `run:` の中に書かない (`env:` で渡す) |

## 1. テストケース一覧

| ID | 層 | 対象 | 前提 (Given) | 操作 (When) | 期待結果 (Then) | 対応 |
|---|---|---|---|---|---|---|
| TST-101 | 結合 | approval-scope | 新しい構成の git repo | `docs/ai/` の文書だけ、または `src/` のコードだけを変える | `ai`・終了コード 0 | R1 |
| TST-102 | 結合 | 同上 | 同上 | `docs/person/` か `docs/client/` の文書を 1 本変える | `human`・1・理由にそのパス | R1・R6 |
| TST-103 | 結合 | 同上 | 同上 | `docs/ai/` と `docs/person/` を両方変える | `human`・理由は person のパスだけ | R1 |
| TST-104 | 結合 | 同上 | 同上 | 門のファイルを 1 つずつ変える (`.github/workflows/x.yml`・`.github/actions/a/action.yml`・`.github/CODEOWNERS`・`CODEOWNERS`・`docs/CODEOWNERS`・`.igeta.json`・`.igeta-version`・`AGENTS.md`・`docs/ai/AGENTS.md`・`CLAUDE.md`・`.claude/settings.json`) | どれも `human` | R1・R5 |
| TST-105 | 結合 | 同上 | 起点の `.igeta.json` に `humanPaths: ["src/core/**"]` | `src/core/a.ts` を変える | `human`・理由に `humanPaths` | R1・R2 |
| TST-106 | 結合 | 同上 | 新しい構成 | docs/ 直下の生成索引だけを変える / 差分が無い / `package.json` とロックファイルだけを変える | どれも `ai` | R1 |
| TST-107 | 結合 | `--ci` | 起点の CODEOWNERS が決定 1 のパスに持ち主を付ける | `docs/person/` の文書を変える / 足す / 消すだけ (追加なし) | `human`・1 | R7 |
| TST-108 | 結合 | `--ci` | 同上 | `docs/person/` の中で文書を移し、同じ PR で `docs/ai/` に文書を足す | `human`・1 (移した先に同じ持ち主が付く) | R7 (b) |
| TST-109 | 単体 | doctor | (a)〜(e) と持ち主が全部そろった設定の応答 (ブランチ保護の形と ruleset の形) | 判定する | どちらも適合・0 | R8 |
| TST-110 | 単体 | 雛形 | `init` が生成した `igeta-gate.yml` (と Igeta 自身の門の workflow) | W1〜W9 を YAML として読んで確かめる | 全部満たす | R9 |
| TST-111 | 結合 | 生成物 | 新しい構成の fixture | `docs/ai/` の文書を足して索引を再生成する | `docs/person/`・`docs/client/` の下のファイルは 1 バイトも変わらない | ADR-0008 決定 4 |

## 2. 否定テスト (必須)

| ID | 観点 (手口) | ケース | 期待結果 |
|---|---|---|---|
| TST-301 | 移動で逃がす | `docs/person/x.md` を `docs/ai/x.md` へ移す | `--base` では `human`。`--ci` では検査不能・2 (削除と、持ち主の付かない追加が同じ PR にある) |
| TST-302 | 大文字と小文字 | `docs/Person/x.md`・`.GitHub/workflows/x.yml` を足す | `--base` では `human`。`--ci` では 2 (CODEOWNERS は大文字と小文字を区別するので持ち主が付かない) |
| TST-303 | 構成を偽る | 起点が旧い構成の repo で、PR が `docs/ai/x.md` を足す | 検査不能・2 (起点のツリーで判定する) |
| TST-304 | 設定を外す | PR が `.igeta.json` から `humanPaths` を消し、そのパスを変える | `human` (理由は `.igeta.json` と、起点の `humanPaths`) |
| TST-305 | 起点を選ぶ | `--ci --base HEAD` / どちらも指定しない | 検査不能・2 |
| TST-306 | 起点が無い | `--ci` で `GITHUB_BASE_REF` が無い / `origin/<名前>` が無い / 浅い clone で共通の祖先が無い / 名前が ref として不正 | どれも検査不能・2 |
| TST-307 | 生成区間に書く | `docs/person/design/README.md` の生成区間の中に 1 行足す | `human` (README の例外は無い) |
| TST-308 | 追跡前のファイル | 手元で `docs/person/new.md` を作り、`git add` しない | `--base` で `human` |
| TST-309 | git の外 | git の repo でないフォルダ / `--root` が repo の最上位でない | 検査不能・2 |
| TST-310 | 名前だけのフォルダ | `docs/personal/x.md`・`docs/clients/x.md` を変える | `ai` (名前の続きには当たらない) |
| TST-311 | フォルダを差し替える | `docs/person` を symlink か submodule に置き換える | `human` |
| TST-312 | 持ち主が付かない | 起点に CODEOWNERS が無い / `humanPaths` のパスが CODEOWNERS に無い / 最後に当たる行に持ち主が無い、の状態で人のパスを変える | `--ci` で 2 |
| TST-313 | doctor: 設定の欠け | 保護も ruleset も無い / 持ち主のレビューが任意 / 新しい push で承認を取り消さず最後の push の承認も求めない / 管理者に適用しない・迂回できる主体がいる / 必須の検査に門が無い、の 5 通り | どれも違反・1 |
| TST-314 | doctor: 持ち主が無効 | GitHub が CODEOWNERS の誤り (存在しない・権限の無い持ち主、文法の誤り) を返す | 違反・1 |
| TST-315 | doctor: 読めない | `gh` が無い / 権限が無くて設定を読めない | 検査不能・2 (成功にしない) |
| TST-316 | 雛形を崩す | 雛形から W1〜W9 を 1 つずつ外した 9 通り | テストが 9 通りとも落ちる |

## 3. トレーサビリティ

| 確認 | 結果 |
|---|---|
| テストを持たない ADR-0008 の決定 | 決定 7 (AI は `仮` で起案する) は機械で強制しない。`AGENTS.md` の雛形に書き ([06](./06-init-scaffold.md))、変わった行と状態は `review-sheet --diff` が並べる ([05](./05-review-sheet.md)) |
| 消す実装 | `src/gate/ManifestChange.ts`・`ReadmeIndexException.ts` と、その呼び出し・テスト (中身で見分ける処理) |
| 残す実装 | `GitRepo.ts`・`PathGlob.ts`・`BranchProtection.ts`・`ApprovalScope.ts` の起点とパスの判定・`core/Codeowners.ts` (R7 が使う) |
| 機械で確かめられないもの | ブランチ保護を置けない契約の repo / 人と AI が同じアカウントを使う運用 / 外部の action の中身 / GitHub・npm・Igeta の配布元 (信頼する側に置く) |

## 4. テストデータ (任意)

本物の git repo を一時フォルダに作る (既存の `ApprovalScopeFixture.ts`)。`doctor` は GitHub の応答を記録した JSON を使う。個人情報は無い。
