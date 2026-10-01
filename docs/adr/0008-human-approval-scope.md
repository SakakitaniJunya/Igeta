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

> **TL;DR**: 変更が `docs/person/` か `docs/client/` を 1 つでも含めば、人の承認が要る。含まなければ
> (`docs/ai/` とコードだけなら) 評価する AI の判定で確定できる。判定は `igeta approval-scope` が差分のパスだけで行う。
> 書いた主体・文面・変更の大きさは見ない

## 関連

- **上流 (depends_on)**: ADR-0001 (承認者で分ける) / ADR-0005 (ルール化)
- **下流**: `igeta approval-scope` (新設) / `scaffold` の `.github/CODEOWNERS` 生成 / 自動で merge する仕組みの門

## Status

2026-10-02 提案。arch-review 待ち。

## Context

ADR-0001 は置き場所を承認者で決めた。この決まりは、承認が要る変更を機械で見分けられて初めて効く。
見分けを「変更が小さいか」「AI が大丈夫と言ったか」に任せると、人の決定が人の知らないうちに変わる。

## Decision Drivers

- 判定が決定的で、主体に依存しないこと (誰が書いても、どのモデルでも同じ結果)
- 置き場所の決まり (ADR-0001) と承認の決まりを 1 つにすること (2 つの表を持たない)

## Decision

**1. 判定**: `igeta approval-scope --base <ref>` は、`<ref>` からの差分に含まれるパスを見る。

| 差分に含まれるパス | 出力 | 意味 |
|---|---|---|
| `docs/person/**` か `docs/client/**` が 1 つでもある | `human` | 人が読んで承認するまで確定しない |
| 上が無い (`docs/ai/**`・コード・生成索引だけ) | `ai` | 評価する AI の判定で確定できる |

生成索引 (`docs/README.md`・`dependencies.md`・各フォルダの README.md) は判定から除く (中身は機械が作る)。
出力は終了コードでも区別する。旧レイアウトの repo では判定できないので、検査不能を返す (`ai` を返さない)。

**2. 門**: 自動で merge する仕組み (CI・自走する AI) は、`human` のとき止まる。`scaffold` は
`.github/CODEOWNERS` に `docs/person/` と `docs/client/` の行を生成し、`AgentsEntrypointCheck` がその行の実在を見る。

**3. AI が `person/` を書くとき**: AI は `person/` の文書を起案してよい。そのとき決まりの状態は `仮` にする。
人が承認したら `決定` に変わる。`仮` のまま `ai/` の設計を進めてよいが、`仮` は生成一覧に出続ける (ADR-0002 条件 8)。

**4. 人が読む量**: `human` のとき、`review-sheet --diff` は `person/` の決まりの表で変わった行だけを並べる。
人は変わった行を読んで決める。

## 却下した選択肢

- **変更の大きさで見分ける (小さければ自動)**: 1 行でも、キャンセル料の率は人の決定。大きさは承認の要否と関係がない
- **文書ごとに `approval: human` を frontmatter に書く**: 置き場所と二重の表になり、食い違う。書き換えれば迂回できる
- **AI に `person/` を書かせない**: 起案まで人がやると量が回らない。起案は AI、承認は人に分ける

## Consequences

- 良い方向: 置き場所がそのまま承認の要否になる。`ai/` だけの変更は人を待たずに進む
- 代償: GitHub 側の branch protection の設定は repo の設定で、Igeta の検査では見えない。`igeta doctor` が
  `gh` で読めたときだけ確認し、読めなければ検査不能と出す。`person/` に 1 文字でも触れば人を待つので、
  誤字の修正でも止まる

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `approval-scope` のテスト (新設) | `person/` だけ・`client/` だけ・`ai/` だけ・混在・生成索引だけの各差分 | `person/` か `client/` を含む差分を `ai` と判定する |
| 同上 | 旧レイアウトの repo | 検査不能ではなく `ai` を返す |
| `AgentsEntrypointCheck` のテスト追加 | `.github/CODEOWNERS` | `docs/person/`・`docs/client/` の行が無いのに通す |

## 再検討トリガ

- 誤字の修正で止まる回数が多く、人の承認が滞るなら、`person/` の「決まりの表の行が変わらない変更」を別扱いにする案を検討する
