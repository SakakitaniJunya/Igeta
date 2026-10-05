---
id: test-init-scaffold
title: テスト仕様 — 新しい repo の骨格 (init・雛形・手引きの突き合わせ)
type: design
kind: test-spec
arc42: 10
id_prefix: TST
status: draft
canonical: true
owners: [eng]
created: 2026-10-02
depends_on: [adr-0005-enforcement-rollout-and-canonical-sync, adr-0008-human-approval-scope]
relates_to: [adr-0009-kind-placement, test-doc-graph]
---

# テスト仕様 — 新しい repo の骨格 (init・雛形・手引きの突き合わせ)

> **TL;DR**: `igeta init` が、最初から 3 フォルダの構成と、人の承認が要るパスの持ち主の割り当てを持つ repo を作るための
> 詳細設計。置いた直後に全部の検査が通ること、持ち主を必ず指定させること、入口の文言と置き場所の表が 1 か所の正本と
> 食い違わないことを、テストで固定する

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | ADR-0005 (決定 2・4) / ADR-0008 (決定 1・7) / 要件定義書 02 | — |
| 下流 | `src/cli/commands/{InitCommand,ScaffoldCommand}.ts`・`src/generators/ApprovalFilesModule.ts` (新設)・`src/core/Audience.ts`・`src/checks/{AgentsEntrypointCheck,DocTemplateCheck}.ts`・`TaxonomyGuideSync.test.ts`・`templates/` の `AGENTS.md` の雛形 | TST-* |

## 0. 規則

| # | 規則 |
|---|---|
| I1 | `igeta init --owner <持ち主>` が置くもの: `.igeta-version` / `docs/README.md` (入口の 3 行と索引の区間) / `docs/person/design/shared/00-map.md` / `docs/person/requirements/01-requirements.md` / `docs/person/decisions/01-decisions.md` / `docs/person/decisions/README.md` / `AGENTS.md` / `.github/CODEOWNERS` / markdownlint の設定 2 本 / `package.json` の scripts と依存。索引は `init` が生成する |
| I2 | 置いた直後の repo で、`docs-check` と `template-check --require-kind --require-human-review` が違反 0 件・警告 0 件 |
| I3 | 人の文書 3 本は雛形から作る (節の構成は雛形のまま)。記入例の行は置かず、要件に最初の業務要件の行 (番号 001) を 1 行だけ、状態 `未決` で置く (決定台帳の一覧に 1 件出る)。地図の入口は要件と決定台帳を指す。雛形の `depends_on`・`relates_to` のうち、置いていない文書を指すものは外す。実装順序の文書は置かない (上流の文書がまだ無い。設計を始めるときに雛形から作る) |
| I4 | 新しい構成では、決定台帳 (kind: decision-log) は DEC・OPEN の行が 0 件でも違反にしない (旧い構成の検査は変えない) |
| I5 | `--owner` は必須。形は `@user`・`@org/team`・メールアドレス。無い・形が違えば、何も書かずに終わる |
| I6 | docs/ の下に README.md 以外の文書 (`.md`) が 1 本でもある repo では、何も書かずに、移行の案内を出して終わる (I7 より先に見る)。案内の文は、0.5.0 では「移行コマンド `igeta docs-migrate` は次の版で入る」、移行コマンドが入る版からは「`igeta docs-migrate` を実行する」 |
| I7 | 既にあるファイルは上書きしない。`AGENTS.md` と `.github/CODEOWNERS` は I8 のとおり足りない分だけ足し、`package.json` は足りない項目だけ足す。ほかのファイルが 1 つでも重なれば、何も書かずに終わる |
| I8 | 承認の割り当てのファイル (`AGENTS.md` と CODEOWNERS) は、`init` と `docs-migrate` が同じ作り手 (`ApprovalFilesModule`) で置く。`AGENTS.md`: 無ければ雛形から作る。あって `docs/person`・`docs/ai` に触れていなければ、入口の節を末尾に足す。`.github/CODEOWNERS`: 無ければ下の内容で作る。あれば、ADR-0008 決定 1 のパスのうち持ち主が付かないものの行だけを**先頭に**足す (後ろの行が勝つので、既にある割り当てを変えない)。足した後も持ち主が付かないパスが残るなら、何も書かずに終わる。repo 直下か `docs/` に CODEOWNERS があるときも、何も書かずに終わる (`.github/` に作ると、GitHub はそちらだけを読み、既にあるファイルが読まれなくなる) |
| I9 | `AGENTS.md` の雛形の節は 4 つで、見出しは「読む順」「人の承認」「手引きの場所」「検査」。読む順: `docs/person/` が上流、`docs/ai/` が持ち場、`docs/client/` は提出物。人の承認: 変更を取り込む前に、`git fetch origin` の後で `igeta approval-scope --base origin/<宛先のブランチ>` で確かめ、`human` か検査不能なら AI は取り込まずに人へ渡す。`person/` の新しい決まりは状態 `仮` で起案する。手引きの場所: `node_modules/igeta/templates/docs/ai/handbook/how-to/` の `01-document-taxonomy.md`・`03-human-review.md`・`04-provenance-workflow.md` を、リンクではなくコードスパンで書く |
| I10 | npm scripts は `docs:graph`・`docs:check`・`docs:template-check` (`igeta template-check --require-kind --require-human-review`)・`scaffold`。終わりに次の手順を 3 行出す: `npm install && npm run docs:check` / GitHub の保護の設定と `igeta doctor` / AI への指示や実行に効くほかのファイル (`.mcp.json` など) を使うなら `.igeta.json` の `humanPaths` に足す |
| I11 | 入口の 3 行の正本は `AUDIENCE_ENTRANCE` の 1 か所 (下の文)。`init` の docs/README.md と `templates/docs/README.md` は同じ文言 |
| I12 | 文書体系の手引きの「kind の置き場所」の表は、要件定義書 02 §7 の表と 1 行ずつ同じ。`TaxonomyGuideSync.test.ts` が §7・手引き・`Role.ts` の 3 つを突き合わせる |
| I13 | 新しい構成では、`scaffold --kind api` の次の手順の案内は `docs/ai/specs/<まとまり>/domain/` を指す。`domain-drift` は、`--docs` を省くと `docs/ai/specs/*/domain/` の全部を順に見る (旧い構成ではいままでのまま) |
| I14 | `AgentsEntrypointCheck` が持ち主を確かめる対象を ADR-0008 決定 1 に合わせる: `package.json` を外し、`.igeta-version`・`CLAUDE.md`・`.claude/`・下位の `AGENTS.md`・直下と `docs/` の CODEOWNERS を足す。`humanPaths` に当たる、いまあるファイルにも持ち主が付くことを見る |

```text
入口の 3 行 (I11)
- **人が決める** — `person/`: 全体の地図 (`person/design/shared/00-map.md`) から読む。決めを待つ行は決定台帳 (`person/decisions/01-decisions.md`)、変わった行は `igeta review-sheet --diff` で読む
- **AI が使う** — `ai/`: 入口は repo 直下の `AGENTS.md`。読む範囲は `igeta context-files <まとまり>` で得る
- **顧客に渡す** — `client/`: 提出物の章を `igeta export` で束ねた PDF を渡す

CODEOWNERS (I8。<持ち主> は --owner の値)
/docs/person/ <持ち主>
/docs/client/ <持ち主>
/.github/ <持ち主>
/CODEOWNERS <持ち主>
/docs/CODEOWNERS <持ち主>
/.igeta.json <持ち主>
/.igeta-version <持ち主>
/.claude/ <持ち主>
AGENTS.md <持ち主>
CLAUDE.md <持ち主>
```

## 1. テストケース一覧

| ID | 層 | 対象 | 前提 (Given) | 操作 (When) | 期待結果 (Then) | 対応 |
|---|---|---|---|---|---|---|
| TST-101 | 結合 | init | 空のフォルダ | `init --owner @lead` | I1 のファイルが全部ある。`docs-check` と `template-check --require-kind --require-human-review` が違反 0 件・警告 0 件。`docs/` の下に、文書体系・人の審査・由来の手順・実装順序の文書が無い | I1〜I4 |
| TST-102 | 結合 | init | TST-101 の後 | 決定台帳を読む | 生成区間に、要件の最初の行が `未決` で 1 行ある。DEC・OPEN の表は見出しだけ | I3・I4 |
| TST-103 | 結合 | CODEOWNERS | TST-101 の後 | `AgentsEntrypointCheck` を当てる | 決定 1 の代表のパスの全部に `@lead` が付く (下位の `docs/ai/AGENTS.md` を含む) | I8・I14 |
| TST-104 | 結合 | 足りない分 | `AGENTS.md` (docs に触れない) と、`/docs/person/design/x/ @other` の 1 行だけの CODEOWNERS がある空の repo | `init --owner @lead` | `AGENTS.md` の末尾に入口の節が足される。CODEOWNERS の先頭に足りない行が足され、`docs/person/design/x/a.md` の持ち主は `@other` のまま | I7・I8 |
| TST-105 | 単体 | AGENTS.md | `init` が置いた `AGENTS.md` | 見出しとコードスパンを読む | I9 の 4 つの見出しと、手引き 3 本のパスがコードスパンである。リンクは無い。「人の承認」の節に `git fetch origin`・`origin/`・「人へ渡す」がある | I9 |
| TST-106 | 結合 | scripts | TST-101 の後 | `package.json` と標準出力を読む | I10 の 4 つの script と、次の手順の 3 行 | I10 |
| TST-107 | 単体 | 入口 | `AUDIENCE_ENTRANCE`・`init` の docs/README.md・`templates/docs/README.md` | 3 行を比べる | 1 字も違わない | I11 |
| TST-108 | 単体 | 手引き | 要件定義書 02 §7・文書体系の手引き・`Role.ts` | 47 kind の行を突き合わせる | 置き場所と型の検査の区分が全部同じ | I12 |
| TST-109 | 結合 | scaffold | 新しい構成の repo (まとまり 2 つに domain の文書) | `scaffold --kind api --context booking --aggregate Reservation` / `domain-drift` (`--docs` なし) | 案内が `docs/ai/specs/booking/domain/` を指す。`domain-drift` が 2 つのまとまりの文書を見る | I13 |

## 2. 否定テスト (必須)

| ID | 観点 (手口・境界) | ケース | 期待結果 |
|---|---|---|---|
| TST-301 | 持ち主が無い | `init` (`--owner` なし) / `--owner lead` / `--owner @` / `--owner "@a b"` | 何も書かずに終わる (引数の誤り) |
| TST-302 | 重なる | `.igeta-version` か `.markdownlint.yaml` か `docs/README.md` が既にある | `CONFLICT` を出し、1 ファイルも書かない |
| TST-303 | 旧い docs がある | `docs/design/basic/01-function-list.md` がある repo | 書かずに、移行の案内 (I6 の文) を出す |
| TST-304 | 持ち主が付かない | `.github/CODEOWNERS` の最後の行が持ち主の無い `/docs/person/` / repo 直下に CODEOWNERS がある / `docs/` に CODEOWNERS がある | どれも何も書かずに終わる |
| TST-305 | 手引きがずれる | 手引きの表の 1 行の置き場所を書き換える / 1 行を消す | `TaxonomyGuideSync.test.ts` が落ちる |
| TST-306 | 入口がずれる | `templates/docs/README.md` の入口の 1 字を変える | テストが落ちる |
| TST-307 | 持ち主を外す | CODEOWNERS から `.igeta-version` の行を消す / `/docs/person/` を `/docs/person/*` に変える / `humanPaths: ["src/core/**"]` があり `src/core/a.ts` に当たる行が無い | `AgentsEntrypointCheck` がどれも違反にする |
| TST-308 | 台帳の例外の範囲 | 旧い構成の repo の決定台帳に DEC・OPEN の行が 0 件 | いままでどおり違反 |

## 3. トレーサビリティ

| 確認 | 結果 |
|---|---|
| 要件・ADR との対応 | audience-directories/REQ-104 = I1〜I4 / ADR-0005 決定 2 = I12、決定 4 = I3・I11・I13 / ADR-0008 決定 1 = I8・I14、決定 7 = I9 / ADR-0009 決定 4 = TST-101 |
| いまの実装との差 | 0.5.0 で実装済み。次の版に回したもの: CODEOWNERS の対象の定義 (`AgentsEntrypointCheck`) と承認の見分けの表 (`ApprovalScope`) の一本化 / 既に持ち主が付くパスの行を足さないこと・`package.json` の script が違う値のとき・`docs/dependencies.md` だけの repo の扱いを、表の行にすること / repo 直下か `docs/` の CODEOWNERS を、GitHub の読む順で読むこと |
| 機械で確かめないもの | 持ち主が実在し、書き込み権限を持つか (この版は誰も確かめない。`doctor` は GitHub が返す CODEOWNERS の誤りが 0 件かだけを見る) / `AGENTS.md` の指示に AI が従うか |

## 4. テストデータ (任意)

一時フォルダに `init` を実行する。持ち主は架空の `@lead`・`@other`。個人情報は無い。
