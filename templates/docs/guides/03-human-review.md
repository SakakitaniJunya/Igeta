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
| 下流 | [地図](../00-map.md) / [決定台帳](../01-decisions.md) / `igeta review-sheet` | — |

## 1. 読む順 (5〜10 分)

設計書が 1 機能で数十ファイルになっても、人が最初に触るのはこの 2〜3 枚だけでよい。

1. **[地図](../00-map.md) (5 分)** — 何を作るか・誰が使うか・主要フローを図で把握する。詳細が要るところだけ「詳細への入口」からたどる。
2. **[決定台帳](../01-decisions.md)** — 誰が・いつ・何を決めた (`DEC-nnn`) か、まだ決まっていない論点と仮置き値 (`OPEN-nnn`) を一覧する。§3 の自動生成区間には「仮置き」と書かれた全箇所が集まっている。
3. **機能ブリーフ (`kind: feature-brief`、あれば)** — 対象機能の WHAT/WHY・ユーザーストーリー・対象外・関わる `REQ` ID の一覧を 1 枚で把握する。要件文・受入条件はここには無い (§4 の review-sheet で展開する)。
4. **対象の要件 (`REQ-nnn`)** — 地図・台帳・機能ブリーフから見えた対象の要件定義書を読む。他ファイルの ID は `<doc-id>/PREFIX-nnn` の修飾形式で書かれているので、どのファイルの ID かが必ず分かる。
5. **レビューシート** — PR の差分を読む直前に `igeta review-sheet` を実行し、対象 REQ の要件文・受入条件・関連 DEC/OPEN・下流の設計書を 1 枚にする (§4)。

## 2. 機能ブリーフと未決の関門

`kind: feature-brief` (`docs/product/features/`) は spec-kit の spec.md 相当。要件文・受入条件は書かず、
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
```

`<doc-id>` は要件定義書などの frontmatter `id`。ファイル名ではなく `id` で指定する。解決できない ID は
Markdown に「解決できない」と明記され、コマンドは exit 1 で終わる (サイレント縮退禁止)。

`review-sheet --diff` (変更ファイル → タスク → FN → REQ を辿り、PR 本文の申告と突き合わせる) と
`igeta analyze` (整合レポート)・`igeta fix-ids` (修飾 ID の機械的な書き換え) は試験中で、別 PR
(`feat/human-review-tools`) で扱う。

## 5. 段階導入

`igeta template-check --require-human-review` は既存プロジェクトを一斉に赤くしないため既定 OFF。
`docs/00-map.md` と `docs/01-decisions.md` を用意できた時点で `--require-human-review` を CI に足す。

## 6. 検査の限界 (機械が見ていないもの)

> **試験中**: `--require-human-review` の検査は Markdown を行単位で解析しており、次の取りこぼしが既知 (2026-09-30 時点、構文解析器への置き換えで解消予定)。検査結果は人の目での確認の補助として使い、緑を合格の証明にしない。
> - 1 行の途中の HTML コメント (`<!-- -->`) を含む行を丸ごとコメント扱いする / 同じ行で閉じて開き直すコメントを追えない
> - 言語タグ付きの行 (` ```ts ` 等) でコードブロックが早く閉じる
> - 「CEO … 未決定」のような否定を決定の主張と誤検出する
> - 地図のリンクがタイトル付き `[x](path "t")`・山括弧 `<path>` だと網羅判定で拾えない
> - 決定台帳の例示行 (コメント内・コードブロック内) も空欄チェックの対象になる
> - レビューシートの修飾 ID 照合で、ある doc-id が別の doc-id の末尾と同じだと (例: auth と legacy-auth) 他の文書の決定も拾う

- **既定 OFF の緑は「人間レビュー層がある」ことを意味しない。** `--require-human-review` を付けていない
  緑は、地図・決定台帳が無くても出る (①のテンプレ適合しか見ていない)。
- **決定台帳の長期アーカイブ方針は検査外。** 決定が増え続けたときに古い `DEC`/`OPEN` をどう畳むか
  (別ファイルへの分割・年度で切る等) は、この検査は決めない。プロジェクトごとに運用で決める。
- **地図の内容の陳腐化は検査外。** 検査が見るのは「`kind: requirements` の全文書がリンクされているか」
  だけで、地図の説明文が実態と合っているかは機械で判定できない。人が定期的に読み直す前提。
