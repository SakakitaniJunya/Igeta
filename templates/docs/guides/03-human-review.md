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

設計書が 1 機能で数十ファイルになっても、人が最初に触るのはこの 2 枚だけでよい。

1. **[地図](../00-map.md) (5 分)** — 何を作るか・誰が使うか・主要フローを図で把握する。詳細が要るところだけ「詳細への入口」からたどる。
2. **[決定台帳](../01-decisions.md)** — 誰が・いつ・何を決めた (`DEC-nnn`) か、まだ決まっていない論点と仮置き値 (`OPEN-nnn`) を一覧する。§3 の自動生成区間には「仮置き」と書かれた全箇所が集まっている。
3. **対象の要件 (`REQ-nnn`)** — 地図・台帳から見えた対象の要件定義書を読む。他ファイルの ID は `<doc-id>/PREFIX-nnn` の修飾形式で書かれているので、地図・台帳をたどるだけでどのファイルの ID かが必ず分かる。
4. **レビューシート** — PR の差分を読む直前に `igeta review-sheet` を実行し、対象 REQ の要件文・受入条件・関連 DEC/OPEN・下流の設計書を 1 枚にする (§2)。

## 2. レビューシートの出し方

```bash
# 対象 REQ を直接指定する
npx igeta review-sheet requirements/REQ-101 requirements/REQ-102

# PR 本文から <doc-id>/PREFIX-nnn を抜き出して対象にする
npx igeta review-sheet --pr-body pr-body.txt
```

`<doc-id>` は要件定義書などの frontmatter `id`。ファイル名ではなく `id` で指定する。解決できない ID は
Markdown に「解決できない」と明記され、コマンドは exit 1 で終わる (サイレント縮退禁止)。

## 3. 要件を直すときの手順

1. **決定台帳に `DEC-nnn` を足す** — 「CEO が決定」等の帰属を主張する前に、決定台帳の §1 に日付・決めた人・原文の引用・決定・影響する文書を 1 行足す。仮置きの値を置くときは §2 に `OPEN-nnn` を足す。
2. **要件定義書 (`REQ-nnn`) を直す** — 台帳に足した `DEC-nnn` / `OPEN-nnn` を本文から参照する。
3. **下流を直す** — [文書体系](./01-document-taxonomy.md) の依存グラフに従って、影響する設計書を直す。地図の「詳細への入口」に新しい要件定義書を足し忘れない (`igeta template-check --require-human-review` が漏れを検査する)。

## 4. 段階導入 (任意)

既存プロジェクトを一斉に赤くしないため、地図の網羅・決定の帰属・修飾 ID・仮置きの参照は
`igeta template-check --require-human-review` を付けたときだけ検査される (既定 OFF)。
`docs/00-map.md` と `docs/01-decisions.md` を用意できた時点でこのフラグを CI に足す。
