---
id: test-doc-graph
title: テスト仕様 — 文書のつながり (依存の向き・索引・まとまりの境界)
type: design
kind: test-spec
arc42: 10
id_prefix: TST
status: draft
canonical: true
owners: [eng]
created: 2026-10-02
depends_on: [adr-0002-role-boundary-invariants, adr-0004-folder-internal-structure-and-growth]
relates_to: [adr-0008-human-approval-scope]
---

# テスト仕様 — 文書のつながり (依存の向き・索引・まとまりの境界)

> **TL;DR**: 新しい構成で、文書同士の参照と生成索引が守る決まりの詳細設計。人の文書は AI の文書を指さない、
> AI の作り方は人の決まりに届く、承認済みの ADR は人の決まりの行から引かれている、人のフォルダの生成物は人の文書だけ
> から作る、まとまりをまたぐ参照は約束と地図だけ、の 5 つを `docs-check` と `context-boundary-check` で確かめる

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | ADR-0002 (条件 3・4・11・13・15) / ADR-0004 (決定 3) | — |
| 下流 | `src/checks/{DocGraphCheck,RoleBoundaryCheck,ContextBoundaryCheck}.ts`・`src/core/ContextGraph.ts`・`src/generators/ContextFilesModule.ts` とそのテスト | TST-* |

## 0. 規則

**役割** = docs/ からのパスの第 1 階層 (`person`・`ai`・`client`)。docs/ 直下の生成索引 2 本と `nonDocPaths` は役割を持たない。
**決まりの行** = 最後の列が `状態` の表の、最初のセルが ID (`接頭辞-3 桁`) で始まる行。

| # | 規則 |
|---|---|
| G1 | 向き: `person` が指してよいのは `person` だけ。`ai` は `person`・`ai`。`client` は 3 つとも。破れば違反 (参照元の行) |
| G2 | G1 の参照は 3 種: (a) frontmatter の参照の項目 (`depends_on`・`relates_to`・`supersedes`・`superseded_by`・`canonical_for`) (b) 本文のリンクと画像。解決した先が `docs/ai/`・`docs/client/` の下なら、ファイルが無くても、フォルダでも当たる (c) 修飾 ID (`<doc-id>/接頭辞-nnn`) の doc-id。生成区間とコードフェンスの中は見ない。裸の ID は `template-check --require-human-review` が修飾を求めるので (c) に帰着する |
| G3 | 届く: `ai/specs/**` の文書は、`depends_on` を 1 回以上たどると `person/` の文書に届く。解決できない id と `external:` はたどらない。届かなければ違反 |
| G4 | ADR の引用: status が `accepted`・`amended` の ADR の番号 (`ADR-NNNN`。前後が英数字でないもの) を、`person/requirements/**` か `person/design/**` の決まりの行 (状態が `廃` の行を除く) のどれかが持つ。無ければ違反 (ADR の 1 行目) |
| G5 | ADR の索引は `docs/person/decisions/README.md` の `adr-index` 区間に出す。ADR があるのに README.md が無ければ違反 |
| G6 | 仮・未決の一覧: 決定台帳の `tentative-index` 区間に、`person/` の決まりの行で状態が `仮`・`未決` のものを、パスの順・行の順に並べる。列は `対象 ID (修飾 ID)・状態・場所・決まり (2 番目のセル)`。`ai/`・`client/` からは集めない。0 件なら `_該当なし_` |
| G7 | 索引の行に読み手の表示と凡例を出さない (フォルダが示す)。docs/README.md の入口の 3 行は「人が決める・AI が使う・顧客に渡す」で、生成区間の外にある (`init` と `docs-migrate` が置く) |
| G8 | 旧い構成の repo には G1〜G7 を当てない (いままでの索引と検査のまま) |
| G9 | 置き場所: `.igeta.json` の `nonDocPaths` に当たるパスは置き場所の判定から外す。docs/ 直下にある、3 フォルダ・生成索引 2 本・`nonDocPaths` 以外のもの (文書でないファイルとフォルダを含む) は違反。frontmatter に Igeta の kind を書いた文書が `nonDocPaths` の下にあれば違反 |

| # | まとまりの境界の規則 (`context-boundary-check`・`context-files`。門の workflow には入れない) |
|---|---|
| B1 | まとまりは、置き場所の型のまとまりの階層から導く。階層が無い場所 (`person/requirements/**`・`ai/specs/tasks/*.md`) は frontmatter の `context` (無記入は `shared`) |
| B2 | `person/decisions/**`・`ai/handbook/**`・`client/**` は、参照元としても参照先としても検査に掛けない |
| B3 | まとまり A の文書が別のまとまり B の文書を参照したら違反 (A・B とも `shared` 以外)。通すのは、参照先が B の約束 (`contract.md`) のときと、地図から地図のとき |
| B4 | `shared` の文書が特定のまとまりの文書を参照したら違反。通すのは、参照元の kind が map・function-list・permission-matrix・domain-overview・aggregate-map のとき (コードに固定) |
| B5 | 参照の種類はいままでと同じ (`depends_on`・本文のリンク・修飾 ID)。`sharedKinds` の設定は読まず、書いてあれば警告を 1 件出す。「未割り当て」の警告は出さない |
| B6 | `context-files <c>` が返すのは、`person/requirements/**`・`person/design/shared/**`・`person/design/<c>/**`・`ai/specs/shared/**`・`ai/specs/<c>/**` と、自分のまとまりの文書が参照する隣の `contract.md`。README.md は返さない。`<c>` のフォルダがどこにも無ければ検査不能 |

## 1. テストケース一覧

| ID | 層 | 対象 | 前提 (Given) | 操作 (When) | 期待結果 (Then) | 対応 |
|---|---|---|---|---|---|---|
| TST-101 | 結合 | 向き | `ai` → `person`・`ai`、`client` → `person`・`ai`・`client`、`person` → `person` の参照 (3 種とも) | `docs-check` | 違反 0 件 | G1・G2 |
| TST-102 | 結合 | 届く | `ai/specs/` の文書が、別の `ai/specs/` の文書を経て `person/` に届く | `docs-check` | 違反 0 件 | G3 |
| TST-103 | 結合 | ADR | `accepted` の ADR を要件の決まりの行が `ADR-0003` と引く / `proposed`・`superseded` の ADR はどこからも引かれない | `docs-check` | 違反 0 件 | G4 |
| TST-104 | 結合 | 索引 | ADR 2 本・状態が `仮` と `未決` の行を持つ人の文書 | `docs-graph` | `decisions/README.md` に ADR の表、決定台帳に 2 行 (修飾 ID・状態・場所・決まり) | G5・G6 |
| TST-105 | 結合 | 索引 | 新しい構成の docs | `docs-graph` | 索引に `_(読み手:` の文字が無い | G7 |
| TST-106 | 結合 | 旧い構成 | 旧い構成の docs | `docs-graph`・`docs-check` | 生成物がいままでと 1 バイトも変わらない | G8 |
| TST-107 | 結合 | 置き場所 | `nonDocPaths: ["docs/demos/**"]` と `docs/demos/a.gif` | `docs-check` | 違反 0 件 | G9 |
| TST-108 | 結合 | 境界 | A の文書が B の `contract.md` を参照 / A の地図が B の地図を参照 / `shared` の機能一覧が A の文書を参照 / ADR と手引きが A・B を参照 | `context-boundary-check` | 違反 0 件 | B2〜B4 |
| TST-109 | 結合 | 読む範囲 | まとまり A・B と全体共通を持つ docs | `context-files A` | B6 の範囲だけを、パスの順で返す (B の文書・ADR・手引き・提出物・README.md を含まない) | B6 |

## 2. 否定テスト (必須)

| ID | 観点 (手口・境界) | ケース | 期待結果 |
|---|---|---|---|
| TST-301 | 人が AI を指す | `person` の文書が `ai` の文書を、`depends_on` / `relates_to` / 本文のリンク / 修飾 ID で指す (4 通り) | どれも違反 |
| TST-302 | フォルダを指す | `person` の文書のリンク先が `docs/ai/specs/` (フォルダ) / 無いファイル `docs/ai/x.md` / `docs/client/` | 違反 |
| TST-303 | AI が顧客を指す | `ai` の文書が `client` の文書を指す | 違反 |
| TST-304 | 届かない | `ai/specs/` の文書の `depends_on` が空 / `ai` の文書だけを回る / 解決できない id だけ | 違反 |
| TST-305 | ADR を引かない | `accepted` の ADR が、どこからも引かれない / `ai` の文書からだけ / `廃` の行からだけ / 「関連」の表や地の文からだけ / `ADR-0003・0006` の `0006` | 違反 |
| TST-306 | AI の行を混ぜる | `ai` の文書に、状態が `仮` の表の行がある | 決定台帳の一覧に出ない。`ai/` だけを変えても `person/` の下は変わらない |
| TST-307 | 索引が無い | ADR があるのに `decisions/README.md` が無い / 区間の印が無い | 違反 |
| TST-308 | 置き場所の外 | docs/ 直下に `notes.txt`・`assets/` がある (`nonDocPaths` に無い) / `nonDocPaths` の下に kind を書いた文書 / `nonDocPaths` が `docs/person/**` に当たる | どれも違反 (3 つ目は設定の違反) |
| TST-309 | 境界を越える | A の文書が B の業務フローを指す / `shared` の非機能が A の文書を指す / A の文書が B の約束でない `ai/specs/B/` の文書を指す | 違反 |
| TST-310 | 設定で逃がす | `sharedKinds` に kind を足して TST-309 を通そうとする | 違反のまま。警告が 1 件出る |
| TST-311 | 無いまとまり | `context-files nothing` | 検査不能 |

## 3. トレーサビリティ

| 確認 | 結果 |
|---|---|
| ADR との対応 | ADR-0002 条件 3 = G1・G2 / 条件 4 = G3 / 条件 11 (一覧) = G6 / 条件 13 = G4 / 条件 15 = G9。ADR-0004 決定 3 の 1〜6 = B1〜B6。ADR-0008 決定 4 = G6・TST-306 |
| いまの実装との差 | G5 は実装済み (`DocGraphCheck` の ADR 索引の置き場所)。G1〜G4・G6・G7・G9・B1〜B6 は未実装 |
| 機械で確かめられないもの | G4 が見るのは番号が引かれていることだけで、行の中身が ADR の決定と合っているかは人が承認のときに見る (ADR-0002) |

## 4. テストデータ (任意)

一時フォルダに新しい構成の docs を作る (既存の `DocGraphCheck.v4.test.ts` の作り方)。個人情報は無い。
