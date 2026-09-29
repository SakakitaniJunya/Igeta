---
id: <kebab-slug>            # 例: reservation-flow。ファイル名と揃える
title: <機能名> — 機能ブリーフ
type: product
kind: feature-brief
arc42: 1
status: draft               # draft | review | fixed | superseded。fixed の間は OPEN-nnn を参照できない (関門)
canonical: true
owners: [product, eng]
created: YYYY-MM-DD
line_limit: 150              # 人のレビュー単位。読み切れない量になったら機能を分割する
depends_on: []
relates_to: []
---

<!--
  spec-kit の specs/NNN-feature/spec.md に相当する「機能単位の 1 枚」。正本 (要件定義書・設計書) は
  変えない。ここに書くのは WHAT/WHY とユーザーストーリーだけで、要件文・受入条件は書かない
  (書くと SoT が二重化する)。中身が知りたければ `igeta review-sheet <doc-id>/REQ-nnn` で
  この機能ブリーフが挙げる REQ ID から要件定義書の本文を展開する。
-->

# <機能名> — 機能ブリーフ

> **TL;DR**: <この機能が何のためにあるかを 1 文で>

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [地図](../../00-map.md) | — |
| 下流 | 関わる REQ ID の一覧を参照 (§4) | REQ-* |

## 1. WHAT/WHY

<!-- 何を・なぜ作るか。2〜3 文。実装方法や技術選定は書かない -->

## 2. ユーザーストーリー

<!--
  1 ストーリー 1 行。優先度は P1 (無いと成立しない) / P2 (無いと不便) / P3 (無くても回る) の 3 段。
  「単独で試せる」は、このストーリーだけを実装して動作確認できるかどうか (spec-kit の Independent Test 相当)。
-->

| 優先度 | ストーリー | 単独で試せる | Given | When | Then |
|---|---|---|---|---|---|
| P1 | | Yes/No | | | |

## 3. 対象外

<!-- この機能ブリーフの範囲に入らないもの。言わないと入ってくるものを名指しする -->

- <スコープ外にしたこと>

## 4. 関わる REQ ID

<!-- 要件文・受入条件はここに書かない。<doc-id>/REQ-nnn の修飾形式で列挙するだけ -->

- `<doc-id>/REQ-nnn`
