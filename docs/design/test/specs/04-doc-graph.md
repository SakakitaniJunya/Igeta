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
relates_to: [adr-0008-human-approval-scope, test-person-form]
---

# テスト仕様 — 文書のつながり (依存の向き・索引・まとまりの境界)

> **TL;DR**: 新しい構成で、文書同士の参照と生成索引が守る決まりの詳細設計。人の文書は AI の文書を指さない、
> AI の作り方は人の決まりに届く、承認済みの ADR は人の決まりの行から引かれている、人のフォルダの生成物は人の文書だけ
> から作る、まとまりをまたぐ参照は約束と地図だけ、の 5 つを `docs-check` と `context-boundary-check` で確かめる

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | ADR-0002 (条件 3・4・11・13・15) / ADR-0004 (決定 3) | — |
| 下流 | `src/checks/{DocGraphCheck,RoleBoundaryCheck,ContextBoundaryCheck}.ts`・`src/core/ContextGraph.ts`・`src/generators/{ContextFilesModule,ContextSizeModule}.ts` とそのテスト | TST-* |

## 0. 規則

**役割** = docs/ からのパスの第 1 階層 (`person`・`ai`・`client`)。docs/ 直下の生成索引 2 本と `nonDocPaths` は役割を持たない。
**決まりの行**の定義は [テスト仕様 — 人の文書の型](./03-person-form.md) の §0。**本文の行** = 生成区間・コードフェンス・HTML コメントの外の行。
**適用範囲**: G1〜G9 と B1〜B6 は新しい構成の repo だけに当てる。旧い構成の repo の検査と生成物は、いままでと 1 バイトも変えない。

| # | 規則 |
|---|---|
| G1 | 向き: `person` が指してよいのは `person` だけ。`ai` は `person`・`ai`。`client` は 3 つとも。破れば違反 (参照元の行) |
| G2 | G1 の参照は次の 4 種 ((b)〜(d) は本文の行だけを見る): (a) frontmatter の参照の項目 (`depends_on`・`relates_to`・`supersedes`・`superseded_by`・`canonical_for`) (b) リンクと画像 `[…](…)`・`![…](…)` (c) 参照の形のリンクの定義 `[名前]: 行き先` (脚注の定義 `[^名前]:` は除く) (d) 修飾 ID (`<doc-id>/接頭辞-nnn`) の doc-id。(b)・(c) は、解決した先が `docs/ai`・`docs/client` そのものか、その下なら、ファイルが無くても、フォルダでも当たる。裸の ID は `template-check --require-human-review` が修飾を求めるので (d) に帰着する |
| G3 | 届く: `ai/specs/**` の文書 (README.md を除く) は、`depends_on` を 1 回以上たどると `person/` の文書に届く。解決できない id と `external:` はたどらない。届かなければ違反 |
| G4 | ADR の引用: status が `accepted`・`amended` の ADR (id が `adr-NNNN-…`) の番号を、`person/requirements/**` か `person/design/**` の決まりの行 (状態が `廃` の行を除く) のどれかが `ADR-NNNN` の形 (大文字。直前が英数字でなく、直後が数字でない) で持つ。無ければ違反 (ADR の 1 行目) |
| G5 | ADR の索引は `docs/person/decisions/README.md` の `adr-index` 区間に出す。ADR があるのに README.md が無ければ違反 |
| G6 | 仮・未決の一覧: 決定台帳の `tentative-index` 区間に、`person/` の決まりの行で状態が `仮`・`未決` のものを並べる。列は `対象 ID` (修飾 ID)・`状態`・`場所` (`[パス:行](台帳からの相対パス#L行)`)・`決まり` (2 番目のセル)。順は、docs/ からのパスの文字コード順、同じ文書の中は行の順。`ai/`・`client/` からは集めない。0 件なら `_該当なし_`。決定台帳の手書きの表 (DEC・OPEN) と「仮置き」の検査は変えない (OPEN の表は、まだどの文書の行にもなっていない論点に使う) |
| G7 | 索引の行に読み手の表示と凡例を出さない (フォルダが示す)。`docs/person/`・`docs/ai/`・`docs/client/` の README.md を作るときの目的の行は、決まった文 (下の表)。docs/README.md の入口の 3 行は生成区間の外にあり、`docs-graph` は書き換えない |
| G8 | G1・G3・G4 は検査 (`docs-check`) のときだけ違反にする。索引を書くとき (`docs-graph`) は警告に留め、索引を書く (違反があっても索引は再生成できる) |
| G9 | 置き場所: `.igeta.json` の `nonDocPaths` に当たるパスは置き場所の判定から外す。docs/ 直下にある、3 フォルダ・生成索引 2 本・`nonDocPaths` 以外のもの (文書でないファイルとフォルダを含む) は違反。frontmatter に Igeta の kind を書いた文書が `nonDocPaths` の下にあれば違反 |

| フォルダ | README.md の目的の行 (G7) |
|---|---|
| `docs/person/` | 人が確定させる文書。確定の前に人が全部読んで承認する (要件・設計・決定) |
| `docs/ai/` | AI が書き、評価する AI が確定させる文書 (作り方の仕様と、作業の手引き)。人の承認は要らない (`humanPaths` で足したパスを除く) |
| `docs/client/` | 顧客と合意して渡す文書 (提出物の章と提案書)。渡す前に人が全部読む |

| # | まとまりの境界の規則 (`context-boundary-check`・`context-files`・`context-size`) |
|---|---|
| B1 | まとまりは、置き場所の型のまとまりの階層から導く。階層が無い場所 (`person/requirements/**`・`ai/specs/tasks/*.md`) は frontmatter の `context` (無記入は `shared`) |
| B2 | `person/decisions/**`・`ai/handbook/**`・`client/**` は、参照元としても参照先としても検査に掛けない |
| B3 | まとまり A の文書が別のまとまり B の文書を参照したら違反 (A・B とも `shared` 以外)。通すのは、参照先が B の約束 (`contract.md`) のときと、地図から地図のとき |
| B4 | `shared` の文書が特定のまとまりの文書を参照したら違反。通すのは、参照元の kind が map・function-list・permission-matrix・domain-overview・aggregate-map のとき (コードに固定) |
| B5 | 参照の種類はいままでと同じ (`depends_on`・本文のリンク・修飾 ID)。`sharedKinds` の設定は読まず、書いてあれば警告を 1 件出す。「未割り当て」の警告は出さない |
| B6 | `context-files <c>` が返すのは、`person/requirements/**`・`person/design/shared/**`・`person/design/<c>/**`・`ai/specs/shared/**`・`ai/specs/<c>/**` と、自分のまとまりの文書が参照する隣の `contract.md` (README.md を除く。パスの文字コード順)。`--with-shared` は結果を変えない。`<c>` のフォルダがどこにも無ければ検査不能。`context-size` は同じ範囲を数える |

## 1. テストケース一覧

| ID | 層 | 対象 | 前提 (Given) | 操作 (When) | 期待結果 (Then) | 対応 |
|---|---|---|---|---|---|---|
| TST-101 | 結合 | 向き | `ai` → `person`・`ai`、`client` → 3 つとも、`person` → `person` の参照 (4 種とも)。`person` の文書のコードフェンスと生成区間の中に `docs/ai/` へのリンク | `docs-check` | 違反 0 件 | G1・G2 |
| TST-102 | 結合 | 届く | `ai/specs/` の文書が、別の `ai/specs/` の文書を経て `person/` に届く。`depends_on` に `external:x` が混ざる | `docs-check` | 違反 0 件 | G3 |
| TST-103 | 結合 | ADR | `accepted` の ADR を要件の決まりの行が `ADR-0003` と引く / `proposed`・`superseded` の ADR はどこからも引かれない | `docs-check` | 違反 0 件 | G4 |
| TST-104 | 結合 | 索引 | ADR 2 本・状態が `仮` と `未決` の行を持つ人の文書 2 本 | `docs-graph` | `decisions/README.md` に ADR の表。決定台帳に 2 行が、パスの順で、修飾 ID・状態・場所・決まりを持つ。仮・未決が 0 件のときは `_該当なし_` | G5・G6 |
| TST-105 | 結合 | 索引 | 新しい構成の docs (3 フォルダに README.md が無い) | `docs-graph` | 索引に `_(読み手:` の文字が無い。3 フォルダの README.md の目的の行が G7 の文 | G7 |
| TST-106 | 結合 | 書ける | `person` → `ai` のリンクと、届かない `ai/specs/` の文書がある docs | `docs-graph` | 警告を出して索引を書く (終了コード 0)。続けて `docs-check` は違反 | G8 |
| TST-107 | 結合 | 旧い構成 | 旧い構成の docs (`sharedKinds` の設定つき) | `docs-graph`・`docs-check`・`context-boundary-check`・`context-files` | 生成物と結果が、いままでと 1 バイトも変わらない | 適用範囲 |
| TST-108 | 結合 | 置き場所 | `nonDocPaths: ["docs/demos/**"]` と `docs/demos/a.gif` | `docs-check` | 違反 0 件 | G9 |
| TST-109 | 結合 | 境界 | A の文書が B の `contract.md` を参照 / A の地図が B の地図を参照 / `shared` の機能一覧が A の文書を参照 / ADR と手引きが A・B を参照 / `context: A` と書いた要件の文書が A の文書を参照 | `context-boundary-check` | 違反 0 件。「未割り当て」の警告が出ない | B1〜B5 |
| TST-110 | 結合 | 読む範囲 | まとまり A・B と全体共通を持つ docs | `context-files A` (`--with-shared` の有無) / `context-size A` | どちらも B6 の範囲だけをパスの順で返す (B の文書・ADR・手引き・提出物・README.md を含まない)。`context-size` は同じ範囲の合計 | B6 |

## 2. 否定テスト (必須)

| ID | 観点 (手口・境界) | ケース | 期待結果 |
|---|---|---|---|
| TST-301 | 人が AI を指す | `person` の文書が `ai` の文書を、`depends_on` / `relates_to` / 本文のリンク / 参照の形の定義 / 修飾 ID で指す (5 通り) | どれも違反 |
| TST-302 | フォルダを指す | `person` の文書のリンク先が `docs/ai` (フォルダ) / `docs/ai/specs/` / 無いファイル `docs/ai/x.md` / `docs/client/` | 違反 |
| TST-303 | AI が顧客を指す | `ai` の文書が `client` の文書を指す | 違反 |
| TST-304 | 届かない | `ai/specs/` の文書の `depends_on` が空 / `ai` の文書だけを回る / 解決できない id だけ / `external:` だけ | 違反 |
| TST-305 | ADR を引かない | `accepted` の ADR が、どこからも引かれない / `ai` の文書からだけ / `廃` の行からだけ / 「関連」の表や地の文からだけ / `ADR-0003・0006` の `0006` / 小文字の `adr-0003` | 違反 |
| TST-306 | AI の行を混ぜる | `ai` の文書に、状態が `仮` の表の行がある | 決定台帳の一覧に出ない。`ai/` だけを変えても `person/`・`client/` の下は 1 バイトも変わらない |
| TST-307 | 索引が無い | ADR があるのに `decisions/README.md` が無い / 区間の印が無い | 違反 |
| TST-308 | 置き場所の外 | docs/ 直下に `notes.txt`・`assets/` がある (`nonDocPaths` に無い) / `nonDocPaths` の下に kind を書いた文書 / `nonDocPaths` が `docs/person/**` に当たる | どれも違反 (3 つ目は設定の違反) |
| TST-309 | 境界を越える | A の文書が B の業務フローを指す / `shared` の非機能が A の文書を指す / A の文書が B の約束でない `ai/specs/B/` の文書を指す | 違反 |
| TST-310 | 設定で逃がす | `sharedKinds` に kind を足して TST-309 を通そうとする | 違反のまま。警告が 1 件出る |
| TST-311 | 無いまとまり | `context-files nothing` | 検査不能 |

## 3. トレーサビリティ

| 確認 | 結果 |
|---|---|
| ADR との対応 | ADR-0002 条件 3 = G1・G2 / 条件 4 = G3 / 条件 11 (一覧) = G6 / 条件 13 = G4 / 条件 15 = G9。ADR-0004 決定 3 の 1〜6 = B1〜B6。ADR-0008 決定 4 = G6・TST-306。audience-directories/REQ-106 = 適用範囲・TST-107 |
| いまの実装との差 | G5 は branch `feat/v4-person` で実装済み (統合していない)。G1〜G4・G6〜G9・B1〜B6 は未実装 |
| 機械で確かめないもの | G4 が見るのは番号が引かれていることだけ (行の中身が ADR の決定と合っているかは人が承認のときに見る) / コードスパンの中のパス・HTML の `<a href>`・`<…>` の自動リンクで `ai/` を指す書き方 / 修飾しない言葉で `ai/` の文書を名指しする書き方 |

## 4. テストデータ (任意)

一時フォルダに新しい構成の docs を作る (既存の `DocGraphCheck.v4.test.ts` の作り方)。個人情報は無い。
