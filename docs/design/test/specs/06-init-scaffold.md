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
relates_to: [adr-0009-kind-placement]
---

# テスト仕様 — 新しい repo の骨格 (init・雛形・手引きの突き合わせ)

> **TL;DR**: `igeta init` が、最初から 3 フォルダの構成と人の承認の門を持つ repo を作るための詳細設計。
> 置いた直後に全部の検査が通ること、持ち主を必ず指定させること、入口の文言と置き場所の表が 1 か所の正本と
> 食い違わないことを、テストで固定する

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | ADR-0005 (決定 2・4) / ADR-0008 (決定 1・5) / 要件定義書 02 (REQ-104) | — |
| 下流 | `src/cli/commands/{InitCommand,ScaffoldCommand}.ts`・`src/core/Audience.ts`・`src/checks/AgentsEntrypointCheck.ts`・`TaxonomyGuideSync.test.ts`・`templates/` の `AGENTS.md`・CODEOWNERS・門の workflow の雛形 | TST-* |

## 0. 規則

| # | 規則 |
|---|---|
| I1 | `igeta init --owner <持ち主>` が置くもの: `.igeta-version` / `docs/README.md` (入口の 3 行と索引の区間) / `docs/person/design/shared/00-map.md` / `docs/person/requirements/01-requirements.md` / `docs/person/decisions/01-decisions.md` / `docs/person/decisions/README.md` / `AGENTS.md` / `.github/CODEOWNERS` / `.github/workflows/igeta-gate.yml` / markdownlint の設定 2 本 / `package.json` の scripts と依存 |
| I2 | 置いた直後の repo で、`docs-check` と `template-check --require-kind --require-human-review` が違反 0 件 (索引は `init` が生成する) |
| I3 | 人の文書 3 本は雛形から作る (節の構成は雛形のまま)。記入例の行は置かず、要件に最初の業務要件の行 (番号 001) を 1 行だけ、状態 `未決` で置く (決定台帳の一覧に 1 件出る)。地図の入口は要件と決定台帳を指す |
| I4 | `--owner` は必須。形は `@user`・`@org/team`・メールアドレス。無い・形が違えば、何も書かずに終わる |
| I5 | CODEOWNERS は、ADR-0008 決定 1 のパスの全部をその持ち主に割り当てる (下の内容) |
| I6 | 既にあるファイルは上書きしない。1 つでも重なれば、何も書かずに終わる (`package.json` は、足りない項目だけを足す) |
| I7 | docs/ の下に文書 (`.md`) が既にある repo では書かず、`docs-migrate` を案内して終わる |
| I8 | `AGENTS.md` の雛形の節は 4 つ: 読む順 (`docs/person/` が上流、`docs/ai/` が持ち場、`docs/client/` は提出物) / 人の承認 (人のパスを変える前に `igeta approval-scope --base <ref>` で確かめる。`person/` の新しい決まりは状態 `仮` で起案する。人の文書を消す・移す変更は別の PR にする) / 手引きの場所 (版に固定した Igeta の手引き 3 本を、リンクではなくコードスパンのパスで書く) / 検査のコマンド |
| I9 | npm scripts は `docs:graph`・`docs:check`・`docs:template-check` (`--require-kind --require-human-review`)・`scaffold`。終わりに、次の手順 (`npm install && npm run docs:check`、ブランチ保護の設定と `igeta doctor`) を出す |
| I10 | 入口の 3 行 (人が決める・AI が使う・顧客に渡す) の正本は `AUDIENCE_ENTRANCE` の 1 か所。`init` の docs/README.md と `templates/docs/README.md` は同じ文言 |
| I11 | 文書体系の手引きの「kind の置き場所」の表は、要件定義書 02 §7 の表と 1 行ずつ同じ。`TaxonomyGuideSync.test.ts` が §7・手引き・`Role.ts` の 3 つを突き合わせる |
| I12 | `scaffold --kind api` の次の手順の案内と、`domain-drift` の既定の探し先を、新しい構成では `docs/ai/specs/<まとまり>/domain/` にする (旧い構成ではいままでのまま) |
| I13 | `AgentsEntrypointCheck` が持ち主を確かめる対象を ADR-0008 決定 1 に合わせる: `package.json` を外し、`.igeta-version`・`CLAUDE.md`・`.claude/`・下位の `AGENTS.md`・直下と `docs/` の CODEOWNERS を足す。`humanPaths` に当たる、いまあるファイルにも持ち主が付くことを見る |

```text
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
| TST-101 | 結合 | init | 空のフォルダ | `init --owner @lead` | I1 のファイルが全部ある。`docs-check` と `template-check --require-kind --require-human-review` が違反 0 件 | I1・I2 |
| TST-102 | 結合 | init | TST-101 の後 | 決定台帳を読む | 生成区間に `requirements/REQ-001` が `未決` で 1 行ある | I3 |
| TST-103 | 結合 | CODEOWNERS | TST-101 の後 | `AgentsEntrypointCheck` と、01 の R7 の持ち主の判定を当てる | 決定 1 の代表のパスの全部に `@lead` が付く (下位の `docs/ai/AGENTS.md` を含む) | I5・I13 |
| TST-104 | 単体 | 門の workflow | TST-101 の後 | [01](./01-approval-gate.md) の W1〜W9 を確かめる | 全部満たす | I1 |
| TST-105 | 単体 | 入口 | `AUDIENCE_ENTRANCE`・`init` の docs/README.md・`templates/docs/README.md` | 3 行を比べる | 1 字も違わない | I10 |
| TST-106 | 単体 | 手引き | 要件定義書 02 §7・文書体系の手引き・`Role.ts` | 47 kind の行を突き合わせる | 置き場所と型の検査の区分が全部同じ | I11 |
| TST-107 | 結合 | scaffold | 新しい構成の repo | `scaffold --kind api --context booking --aggregate Reservation` | 次の手順が `docs/ai/specs/booking/domain/` を指す | I12 |

## 2. 否定テスト (必須)

| ID | 観点 (手口・境界) | ケース | 期待結果 |
|---|---|---|---|
| TST-301 | 持ち主が無い | `init` (`--owner` なし) / `--owner lead` / `--owner @` / `--owner "@a b"` | 何も書かずに終わる (引数の誤り) |
| TST-302 | 重なる | `AGENTS.md` か `.github/CODEOWNERS` か `docs/README.md` が既にある | `CONFLICT` を出し、1 ファイルも書かない |
| TST-303 | 旧い docs がある | `docs/design/basic/01-function-list.md` がある repo で `init` | 書かずに `docs-migrate` を案内する |
| TST-304 | 手引きがずれる | 手引きの表の 1 行の置き場所を書き換える / 1 行を消す | `TaxonomyGuideSync.test.ts` が落ちる |
| TST-305 | 入口がずれる | `templates/docs/README.md` の入口の 1 字を変える | テストが落ちる |
| TST-306 | 持ち主を外す | CODEOWNERS から `.igeta-version` の行を消す / `/docs/person/` を `/docs/person/*` に変える / 最後の行に持ち主の無い `/docs/person/` を足す | `AgentsEntrypointCheck` がどれも違反にする |
| TST-307 | `humanPaths` | `.igeta.json` に `humanPaths: ["src/core/**"]` があり、`src/core/a.ts` に当たる行が CODEOWNERS に無い | `AgentsEntrypointCheck` が違反にする |
| TST-308 | 手引きの写し | `init` の後の repo | `docs/` の下に文書体系・人の審査・由来の手順の 3 つの kind の文書が無い |

## 3. トレーサビリティ

| 確認 | 結果 |
|---|---|
| 要件・ADR との対応 | audience-directories/REQ-104 = I1・I2 / ADR-0005 決定 2 = I11、決定 4 = I3・I10・I12 / ADR-0008 決定 1 = I5・I13、決定 5 = TST-104、決定 7 = I8 / ADR-0009 決定 4 = TST-308 |
| いまの実装との差 | `init` は旧い入口の docs/README.md だけを置き、人の文書・`AGENTS.md`・CODEOWNERS・門の workflow を置かない。`TaxonomyGuideSync.test.ts` は手引きを見ていない。`AgentsEntrypointCheck` の対象は前の設計のまま (`package.json` を含む) |
| 機械で確かめられないもの | 持ち主が実在し、権限を持つか (`doctor` が GitHub から読む。[01](./01-approval-gate.md) の R8) / `AGENTS.md` の指示に AI が従うか |

## 4. テストデータ (任意)

一時フォルダに `init` を実行する。持ち主は架空の `@lead`。個人情報は無い。
