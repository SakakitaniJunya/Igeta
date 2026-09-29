---
id: <kebab-slug>            # 例: reservation-map
title: まとまりの地図 — <context>
type: map
kind: context-map
status: draft               # draft | review | fixed
canonical: true
owners: [product, eng]
created: YYYY-MM-DD
context: <context>          # このまとまり自身の名前 (kebab)。無記入にしない
line_limit: 150              # developer の入口。読み切れない量になったら機能を分割する
depends_on: [map]
relates_to: []
---

<!--
  読み手: 開発者。全体の地図 (../../00-map.md) の次に読む。このまとまりだけを見れば
  「何を作り、何を含み、隣とどう繋がるか」が分かる。書かないもの: 要件の全文・受入条件・
  他まとまりの内部実装。検査: context-boundary-check (このまとまりの文書が他まとまりの内部を
  直接参照していないか)。Spec: docs/explanation/07-context-boundaries.md §2
-->

# まとまりの地図 — <まとまり名>

> **TL;DR**: <このまとまりが何を持つかを 1 文で>
> - <一番大事な業務価値>

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [全体の地図](../../00-map.md) | — |
| 下流 | このまとまりの `feature-brief` 全部 | — |

## 1. 概要

<!-- 2〜3 文。このまとまりが何を持ち、何を持たないか -->

## 2. 含む機能

<!-- REQ 範囲と、関わる feature-brief へのリンクを列挙する (地図の網羅性を検査で見る) -->

| 機能 | feature-brief | 対応 REQ 範囲 |
|---|---|---|
| | | |

## 3. 隣接まとまりへの入口

<!-- 隣接まとまりの context-contract (約束の 1 枚) だけを列挙する。内部文書へは直接リンクしない -->

| 隣接まとまり | 約束の 1 枚 |
|---|---|
| | |
