---
id: adr-0008-human-approval-scope
title: ADR-0008 人の承認が要る変更を、差分のパスで見分ける
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-02
depends_on: [adr-0001-document-role-directories, adr-0005-enforcement-rollout-and-canonical-sync]
relates_to: [adr-0002-role-boundary-invariants]
---

# ADR-0008: 人の承認が要る変更を、差分のパスで見分ける

> **TL;DR**: 変更が `docs/person/`・`docs/client/` か、門を決めるファイル (CODEOWNERS・CI の設定・`.igeta.json`・
> `AGENTS.md`・`package.json` の scripts と Igeta の版) を 1 つでも含めば、人の承認が要る。含まなければ評価する AI の判定で確定できる。
> 判定は `igeta approval-scope` が差分のパスだけで行い、書いた主体・文面・変更の大きさは見ない

## 関連

- **上流 (depends_on)**: ADR-0001 (確定させる人で分ける) / ADR-0005 (ルール化)
- **下流**: `igeta approval-scope` (新設) / `scaffold` の `.github/CODEOWNERS` 生成 / 自動で merge する仕組みの門

## Status

2026-10-02 提案。

## Context

ADR-0001 は置き場所を「確定させる人」で決めた。この決まりは、承認が要る変更を機械で見分けられて初めて効く。
見分けを「変更が小さいか」「AI が大丈夫と言ったか」に任せると、人の決定が人の知らないうちに変わる。

## Decision Drivers

- 判定が決定的で、主体に依存しないこと (誰が書いても、どのモデルでも同じ結果)
- 門そのもの (判定と強制の設定) を、門を通らずに変えられないこと

## Decision

**1. 判定**: 差分に含まれるパスで決める。

| 差分に含まれるもの | 出力 |
|---|---|
| `docs/person/**`・`docs/client/**` のファイル (README.md は下の例外) | `human` |
| `.github/CODEOWNERS`・`.github/workflows/**`・`.igeta.json`・`AGENTS.md`・`package.json` の `scripts` と `igeta` の依存・ロックファイルの `igeta` の行 | `human` |
| `.igeta.json` の `humanPaths` に足したパス (足すことだけができ、外す設定は無い) | `human` |
| 上のどれも無い (`docs/ai/**`・コード・生成索引だけ) | `ai` |

各フォルダの README.md は、生成器が管理する AUTOGEN 区間 (dir-index・adr-index・tentative-index) の中だけが変わり、
区間の中身が再生成の結果と一致するときに限り判定から除く。それ以外の README の変更は、置かれたフォルダの判定に従う (`person/`・`client/` なら `human`)。`person/`・`client/` の README.md の
区間の外に書けるのは frontmatter と 1 行の目的だけ。HTML コメントと管理外の区間は違反 (ADR-0002 条件 10)。
Igeta 自身の repo は `humanPaths` に、全利用 repo の決まりを決めるもの (`templates/**`・`src/checks/**`・`src/gate/**`
(`approval-scope` の本体を置く)・`src/core/{Role,IgetaConfig,LineClassifier}.ts`) と、Igeta 自身の機能の決めをまだ持つ
解説 (`docs/explanation/0[3-9]-*.md`。person の行へ書き直すまで) を足す。
旧い構成の repo では判定できないので、検査不能を返す (`ai` を返さない)。出力は終了コードでも区別する。

**2. 差分の取り方**: `git diff --name-status --no-renames <merge-base>`。移動は「元の削除」と「先の追加」の 2 行として
見るので、`person/` から `ai/` への移動も `human` になる。CI では `igeta approval-scope --ci` を使い、起点は CI が渡す
保護ブランチとの merge-base に固定する (行為者が引数で選べない)。`--base` は手元の確認用で、CI では使わない。

**3. 門**: 自動で merge する仕組み (CI・自走する AI) は、`human` のとき止まる。`scaffold` は `.github/CODEOWNERS` に
`docs/person/`・`docs/client/` と上の設定ファイルの行を生成し、`AgentsEntrypointCheck` がその行の実在を見る。

**4. AI が `person/` を書くとき**: 起案してよい。決まりの状態は `仮` にし、人が承認したら `決定` に変える。
`仮` のまま `ai/` の設計を進めてよいが、`仮` は決定台帳の一覧に出続ける (ADR-0002 条件 11)。

**5. 人が読む量**: `human` のとき、`review-sheet --diff` は `person/` の決まりの表で変わった行だけを並べる。

## 却下した選択肢

- **変更の大きさで見分ける**: 1 行でも、キャンセル料の率は人の決定。大きさは承認の要否と関係がない
- **文書ごとに `approval: human` を書く**: 置き場所と二重の表になり食い違う。書き換えれば迂回できる
- **AI に `person/` を書かせない**: 起案まで人がやると量が回らない。起案は AI、承認は人に分ける

## Consequences

- 良い方向: 置き場所がそのまま承認の要否になる。`ai/` だけの変更は人を待たずに進む
- 代償: `person/` に 1 文字でも触れば人を待つので、誤字の修正でも止まる
- 限界: (1) 人の決定を `ai/` に書く誤りは見分けられない (ADR-0001 の限界)。(2) GitHub の branch protection の設定は
  Igeta の検査からは見えない。`igeta doctor` が `gh` で読めたときだけ確かめ、読めなければ検査不能と出す。
  (3) 人と AI が同じ GitHub アカウントで動くと、承認したのが人かどうかを区別できない。承認は人のアカウントで行う

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `approval-scope` のテスト (新設) | `person/`・`client/`・設定ファイル・`scripts`・`humanPaths`・`ai/` だけ・移動・AUTOGEN 区間だけの各差分 | 人の承認が要る差分を `ai` と判定する / 再生成と合わない区間の変更を除く |
| 同上 | 旧い構成の repo | 検査不能ではなく `ai` を返す |
| `AgentsEntrypointCheck` のテスト追加 | `.github/CODEOWNERS` | 必要な行が無いのに通す |
| `PersonFormCheck` のテスト追加 | `person/`・`client/` の README.md | AUTOGEN 区間の外に決まりを書いても通す |

## 再検討トリガ

- 誤字の修正で止まる回数が多く人の承認が滞るなら、「決まりの表の行が変わらない変更」を別扱いにする案を検討する
