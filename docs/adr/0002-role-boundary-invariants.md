---
id: adr-0002-role-boundary-invariants
title: ADR-0002 確定させる人の境界を守る不変条件と機械検査の対応
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-01
depends_on: [adr-0001-document-role-directories]
relates_to: [adr-0009-kind-placement, adr-0010-value-ownership]
---

# ADR-0002: 確定させる人の境界を守る不変条件と機械検査の対応

> **TL;DR**: ADR-0001 の分割を「決めて終わり」にしないため、15 の不変条件に機械検査を対応させる。新設は 5 つ
> (`RoleBoundaryCheck`・`PersonFormCheck`・`FolderSizeCheck`・`AgentsEntrypointCheck`・`approval-scope`)。
> 量の上限は、1 本の行数を違反、まとまりの合計字数を警告で始める。検査の無い条件は採らない

## 関連

- **上流 (depends_on)**: ADR-0001
- **下流**: `src/core/Role.ts` / `src/checks/{RoleBoundaryCheck,PersonFormCheck,FolderSizeCheck,AgentsEntrypointCheck}.ts` (新設) / `DocGraphCheck.ts` (拡張)

## Status

2026-10-02 提案 (arch-review v4 round 2 の FIX を反映)。arch-review 待ち。

## Context

新しく要るのは、`person/` が人の読める型と量を保つこと、`ai/` が人の決定から浮かないこと、人の承認が要る変更を
機械で見分けること、人の目に見えない書き込み口を作らないこと。

## Decision Drivers

- 門は決定的な機械検査だけ (正規表現・文字列一致・件数・SHA256)。実測の無い数値は違反にしない

## Decision

**採用: 以下 15 条件。** 「○ の kind」は ADR-0009 決定 1 で型の検査が ○ の kind。
人の文書の型は、結論 (3 行まで) → 図 → 決まりの表 → 決めてほしいこと の順。

| # | 不変条件 | 検査 | 強さ |
|---|---|---|---|
| 1 | kind → 置き場所の正本は 1 か所 | `Role.test.ts`: `ARC42_BY_KIND` と集合が一致、重複 0 | 違反 |
| 2 | 文書は ADR-0009 の表のパスにある。フォルダ名と `context` が一致する | `RoleBoundaryCheck` | 違反 |
| 3 | 依存は上流へ: `ai` → `person`、`client` → `person`・`ai`。`person` は `ai`・`client` を指さない | `DocGraphCheck` 拡張 (`depends_on`・`relates_to`・本文リンク・修飾 ID) | 違反 |
| 4 | `ai/specs/` の文書は `depends_on` を辿ると `person/` に届く | `DocGraphCheck` 拡張 | 違反 |
| 5 | ○ の kind: 決まりの表が 1 つ以上あり、行頭が自分の ID の行は `状態` (決定・仮・未決・廃) を持つ | `PersonFormCheck` | 違反 |
| 6 | 図が要る kind (map・context-map・business-flow・screen-spec・solution-strategy・as-is-overview) に図が 1 枚以上 | `PersonFormCheck` | 違反 |
| 7 | ○ の kind は 1 本 100 行まで (requirements は 150 行)。他の kind は雛形の行数上限 | `PersonFormCheck` | 違反 |
| 8 | まとまりの合計 15,000 字、全体共通 (要件 + `design/shared/`) 30,000 字まで | `PersonFormCheck` (検査の出力と `review-sheet` に出す) | 警告 → 下の測定の後のメジャー版で違反 |
| 9 | `廃` の行は消さず、状態を戻さず、番号を使い直さない。廃の行は移動先を書かない (ai の行が元の ID を引く) | `PersonFormCheck` が CI の比べる起点 (merge-base) と比べる | 違反 |
| 10 | `person/`・`client/` の文書に HTML コメントを書かない。AUTOGEN 区間は生成器が管理する 3 種 (dir-index・adr-index・tentative-index) だけ | `PersonFormCheck` | 違反 |
| 11 | 仮と未決は決定台帳に集まる。`ai/` の文書に未決の節を置かない | 決定台帳の生成一覧 / `RoleBoundaryCheck` | 生成 / 違反 |
| 12 | 人の承認が要る変更を見分ける | `approval-scope` (ADR-0008) | 違反 |
| 13 | `accepted`・`amended` の ADR の番号を、`person/requirements/` か `person/design/` のどれかの行が引いている | `DocGraphCheck` 拡張 | 違反 |
| 14 | 1 フォルダ 15 本まで (ADR-0009 決定 5 の対象外を除く) | `FolderSizeCheck` | 違反 |
| 15 | AI の入口は repo 直下の `AGENTS.md`。docs/ の文書は 3 フォルダか `nonDocPaths` のどちらかに属する | `AgentsEntrypointCheck` / `RoleBoundaryCheck` | 違反 |

条件 8 の値は、業務フロー 3 本の実測 (本文が元の 26%) を他の文書へ当てはめた見込みから置いた。違反に上げる版は、
次の測定が済んだ後のメジャー版: kind ごとの字数 (中央値・上位 10%・最大)、全体共通の kind ごとの縮み方、
決める文書を読む速さ、1 回の承認で変わる行数。版で決まり、利用 repo の設定では変えられない (ADR-0005)。

条件 13 が保証するのは「番号が引かれている」ことだけで、引いた行の中身が ADR の決定と合っているかは機械では
見えない。合っているかは、引く行の差分を人が承認するときに見る。

## 却下した選択肢

- **「読みやすさ」を検査する**: 決定的に判定できない。型・量・参照の向きだけを検査し、残りは承認のときに人が見る
- **合計の上限を最初から違反にする**: 実測の無い値で CI を止めると、超えた文書を `ai/` へ押し出す誘因になる
- **条件 4 を行の単位にする**: 書く量が増えすぎる。行の追随は `review-sheet` の「要追随」欄で補う

## Consequences

- 良い方向: 15 条件が全部「何で守るか」を持つ。人の目に見えない書き込み口 (コメント・管理外の区間) が無い
- 代償: 既存の基本設計は条件 5〜7 で落ちる。移行は書き直しを伴う (ADR-0003)。人の決定を `ai/` に書く誤りは、
  どの条件でも落ちない (ADR-0001 の限界)

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `Role.test.ts` | `ROLE_OF_KIND` | `ARC42_BY_KIND` と集合が食い違う / 重複がある |
| `RoleBoundaryCheck.test.ts` | fixture の 3 フォルダ | 表に無い場所・`context` の食い違い・ai の未決の節を検出しない |
| `PersonFormCheck.test.ts` | fixture の `person/` と比べる起点 | 状態・図・行数・廃の行の削除・HTML コメント・管理外の区間を検出しない |
| `DocGraphCheck` のテスト追加 | 向き・孤立・ADR の引用 | `person` → `ai` の参照、`person/` に届かない `ai/specs/`、どこからも引かれない `accepted` の ADR を通す |

## 再検討トリガ

- 条件 8 の測定が済んだら値を改め、そのメジャー版で違反に上げる
