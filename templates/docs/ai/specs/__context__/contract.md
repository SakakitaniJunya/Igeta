---
id: <kebab-slug>            # 例: reservation-contract
title: まとまりの約束 — <context>
type: map
kind: context-contract
status: draft               # draft | review | fixed
canonical: true
owners: [product, eng]
created: YYYY-MM-DD
context: <context>          # このまとまり自身の名前 (kebab)。無記入にしない
line_limit: 150              # 他まとまりに見せてよいものだけを 150 行以内に収める
depends_on: [<自分の context-map の id>]
relates_to: []
---

<!--
  読み手: 他まとまりの開発者・AI。他まとまりに見せてよいもの (API・イベント・持っているデータ・
  用語) だけを書く 1 枚。書かないもの: 内部実装・内部だけで使う REQ・未確定の値の詳細。
  context-boundary-check はこの文書への参照だけを「境界を越えてよい参照」として通す。
  Spec: docs/explanation/07-context-boundaries.md §3
-->

# まとまりの約束 — <まとまり名>

> **TL;DR**: <このまとまりが他まとまりに提供するものを 1 文で>

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | このまとまりの地図 (`person/design/<まとまり>/00-map.md`) | — |
| 下流 | 参照する他まとまりの文書全部 | — |

## 1. 公開 API・イベント

<!-- 呼び出せる API、発行するイベントだけ。内部の実装方法は書かない -->

| 種別 | 名前 | 用途 |
|---|---|---|
| | | |

## 2. 持っているデータ

<!-- 他まとまりが参照してよいデータの形だけ。テーブル定義そのものは内部文書に置く -->

| 概念 | 意味 | 他まとまりから見える範囲 |
|---|---|---|
| | | |

## 3. 用語

<!-- 他まとまりが誤読しやすい語だけ。全部の用語集は person/design/shared/10-glossary.md -->

| 語 | このまとまりでの意味 |
|---|---|
| | |
