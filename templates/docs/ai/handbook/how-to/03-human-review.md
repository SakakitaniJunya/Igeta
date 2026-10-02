---
id: human-review
title: 人間レビュー層の読み方 — 地図・決定台帳・レビューシート
type: guide
kind: human-review
status: active
canonical: true
owners: [product, eng]
created: YYYY-MM-DD
depends_on: [document-taxonomy]
relates_to: [map, decisions]
---

# 人間レビュー層の読み方

> **When to use**: 「要件を理解して直す」「コードレビューする」の前に読む。設計書が増えて全部は読めなくなったときの入口。

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [文書体系](./01-document-taxonomy.md) | — |
| 下流 | 地図 (`docs/person/design/shared/00-map.md`) / 決定台帳 (`docs/person/decisions/01-decisions.md`) / `igeta review-sheet` / `igeta analyze` | — |

## 1. 読む順 (5〜10 分)

設計書が 1 機能で数十ファイルになっても、人が最初に触るのはこの数枚だけでよい。

1. **全体の地図 (`docs/person/design/shared/00-map.md`、5 分)** — 何を作るか・誰が使うか・主要フローを図で把握する。詳細が要るところだけ「詳細への入口」からたどる。
2. **まとまりの地図 (`kind: context-map`、`docs/person/design/<まとまり>/00-map.md`、あれば)** — 対象のまとまり (業務コンテキスト) だけの概要・含む機能・隣接まとまりへの入口を把握する。まとまりの地図が 1 枚も無い案件ではこの手順を飛ばす ([まとまりの境界](https://github.com/SakakitaniJunya/Igeta/blob/main/docs/explanation/07-context-boundaries.md))。
3. **今回の変更のレビューシート** — PR の差分を読む直前に `igeta review-sheet` を実行し、対象 REQ の要件文・受入条件・関連 DEC/OPEN・下流の設計書を 1 枚にする (§4)。決定台帳 (`docs/person/decisions/01-decisions.md`) のうち今回関係する決定・未決はここに展開されるので、読む順には別途挟まない (台帳そのもの — 全決定と「仮置き」の一覧 — を読むのは要件を直すとき。§3)。機能ブリーフ (`kind: feature-brief`) も対象機能に関わる分だけ、必要なときにここで読む (要件文・受入条件は機能ブリーフには無く、review-sheet が要件定義書から展開する)。他ファイルの ID は `<doc-id>/PREFIX-nnn` の修飾形式で書かれているので、どのファイルの ID かが必ず分かる。

45 ファイル規模で「どこが穴か」を先に知りたいときは、読む前に `igeta analyze` (§5) を走らせる。

## 2. 機能ブリーフと未決の関門

`kind: feature-brief` (`docs/person/design/<まとまり>/features/`) は spec-kit の spec.md 相当。要件文・受入条件は書かず、
WHAT/WHY・ユーザーストーリー (P1/P2/P3・単独で試せる・Given/When/Then)・対象外・関わる `REQ` ID の一覧だけを持つ
(SoT は要件定義書のまま、二重化しない)。**ユーザーストーリーの Given/When/Then は「試せるかどうか」の
確認手順であって、要件定義書の受入条件 (測定可能な合格基準) の言い換えではない** — 両方書くと更新漏れで
食い違うため、受入条件は要件定義書だけに置く。

`requirements` / `feature-brief` は `status: fixed` (確定) を名乗っている間、`OPEN-nnn` を参照できない
(**未決の関門**。spec-kit の `[NEEDS CLARIFICATION]` が残っている間は次工程に進めないのと同じ発想)。
未決を先に決定台帳の `DEC-nnn` へ移すか、確定を `review` 等へ戻す。

## 3. 要件を直すときの手順

1. **決定台帳に `DEC-nnn` を足す** — 「CEO が決定」等の帰属を主張する前に、決定台帳の §1 に日付・決めた人・原文の引用・決定・影響する文書を 1 行足す (空欄禁止)。仮置きの値を置くときは §2 に `OPEN-nnn` を足す (論点・仮置き値も空欄禁止)。
2. **要件定義書 (`REQ-nnn`) を直す** — 台帳に足した `DEC-nnn` / `OPEN-nnn` を本文から参照する。`status: fixed` にするのは未決の関門 (§2) を抜けた後。
3. **下流を直す** — [文書体系](./01-document-taxonomy.md) の依存グラフに従って、影響する設計書を直す。地図の「詳細への入口」に新しい要件定義書を足し忘れない (`igeta template-check --require-human-review` が漏れを検査する)。

## 4. レビューシートの出し方

```bash
# 対象 REQ を直接指定する
npx igeta review-sheet requirements/REQ-101 requirements/REQ-102

# PR 本文から <doc-id>/PREFIX-nnn を抜き出して対象にする
npx igeta review-sheet --pr-body pr-body.txt

# 変更ファイル → タスク → FN → REQ を辿り、PR 本文の申告と突き合わせる
npx igeta review-sheet --diff origin/main..HEAD --pr-body pr-body.txt
```

`<doc-id>` は要件定義書などの frontmatter `id`。ファイル名ではなく `id` で指定する。解決できない ID は
Markdown に「解決できない」と明記され、コマンドは exit 1 で終わる (サイレント縮退禁止)。`--diff` は
「申告に無いが影響する REQ」があるときだけ exit 1 にする (申告より広く触れているのに気付けないのが一番危険)。

## 5. 整合レポート (`igeta analyze`)

読み取り専用・非破壊。網羅 (`REQ`→`FN`→タスクの欠落)・タスクが存在しない ID を参照しているダングリング
参照・未決 (`OPEN`)・曖昧語 (既定は「速い」「適切に」等、`--ambiguous-words` は今後の拡張予定)・ID の
ローカル採番の重複を 1 枚の表 + 網羅率 + 次の一手で出す。critical (ダングリング参照) だけ exit 1。

## 6. 段階導入・移行の実測

`igeta template-check --require-human-review` は既存プロジェクトを一斉に赤くしないため既定 OFF。
ある案件 (86 ファイル) への実測では 584 件の指摘のうち **539 件 (92%) が修飾 ID 不足**だった。
移行手順:

1. `igeta analyze` で全体の穴 (網羅・ダングリング参照) を先に把握する。
2. `igeta fix-ids` (既定 dry-run) で、定義元が 1 件に一意な裸の ID 参照だけを機械的に修飾する。
   複数ファイルのローカル採番で曖昧なものは対象外 (推測で書き換えると本文の意味を取り違えるため、人が
   `<doc-id>/PREFIX-nnn` を選ぶ)。その案件では 539 件中 183 件がこの一意なケースだった。`--write` を
   付けるまで 1 バイトも書き込まない。
3. 残り (複数ファイルのローカル採番・決定の帰属・仮置きの参照漏れ) は人が直す。
4. `docs/person/design/shared/00-map.md` と `docs/person/decisions/01-decisions.md` を用意できた時点で `--require-human-review` を CI に足す。

## 7. 検査の限界 (機械が見ていないもの)

> **試験中**: `--require-human-review` の検査は Markdown を行単位で解析しており、次の取りこぼしが既知。検査結果は人の目での確認の補助として使い、緑を合格の証明にしない。
> - 1 行の途中の HTML コメント (`<!-- -->`) を含む行を丸ごとコメント扱いする / 同じ行で閉じて開き直すコメントを追えない
> - 言語タグ付きの行 (` ```ts ` 等) でコードブロックが早く閉じる
> - 地図のリンクがタイトル付き `[x](path "t")`・山括弧 `<path>` だと網羅判定で拾えない
> - レビューシートの修飾 ID 照合で、ある doc-id が別の doc-id の末尾と同じだと (例: auth と legacy-auth) 他の文書の決定も拾う

- **既定 OFF の緑は「人間レビュー層がある」ことを意味しない。** `--require-human-review` を付けていない
  緑は、地図・決定台帳が無くても出る (①のテンプレ適合しか見ていない)。
- **決定台帳の長期アーカイブ方針は検査外。** 決定が増え続けたときに古い `DEC`/`OPEN` をどう畳むか
  (別ファイルへの分割・年度で切る等) は、この検査は決めない。プロジェクトごとに運用で決める。
- **地図の内容の陳腐化は検査外。** 検査が見るのは「`kind: requirements` の全文書がリンクされているか」
  だけで、地図の説明文が実態と合っているかは機械で判定できない。人が定期的に読み直す前提。
- **`review-sheet --diff` は `docs/ai/specs/tasks/` のタスク行の `path` 記載に依存する。** `kind: tasks` の
  文書が 1 本も無い、または変更ファイルが 1 件もタスクに一致しないときは「裏取りができていない」ため
  exit 2 (検査不能) にする (0 件を緑にしない、原則 8)。一部のファイルだけ一致しない場合は advisory の
  ままなので exit 1/0 になる。タスクの `path` を書く運用を採用していないプロジェクトでは、この機能で
  虚偽報告 (実例 3) を機械的に防ぐことはできない。
