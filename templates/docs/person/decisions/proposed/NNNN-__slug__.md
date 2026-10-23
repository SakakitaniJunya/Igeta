---
id: <kebab-slug>
title: ADR-NNNN <決定の要約>
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: YYYY-MM-DD
awaiting: <承認する人の名前 (.igeta.json の decisions.approvers の name)>
depends_on: []
relates_to: []
---

# ADR-NNNN: <決定の要約>

> **TL;DR**: <決定を 1 文で>
> - <最重要の制約または帰結>
> - <これが置き換える・却下するもの>

## 関連

- **上流 (depends_on)**: <この決定の前提になる ADR・設計書>
- **下流**: (生成索引が出す)

## Status

<日付> 提案。状態 (承認・却下・置換) は、この文書に手で書かない。`igeta decision-accept` などが、下の承認の履歴に書く。

## Context

<背景を 5 行以内で>

## Decision Drivers

- <判断軸 1 (最優先)>
- <判断軸 2>
- <判断軸 3>

## Decision

**採用: <案>**。理由: <1 行>。

| 判断軸 | 採用案での扱い | 理由 |
|---|---|---|
| | | |

## 却下した選択肢

- **<案>**: <却下した理由を 2 行以内で>

## Consequences

- 良い方向: <得るもの>。代償: <失うもの>

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| | | |

## 再検討トリガ

- <見直す条件を、観測できる形で>

## 承認の履歴

> `igeta decision-accept|reject|supersede|amend` だけが行を足す。手で書かない (docs-check が落とす)。

| 日付 | 事象 | 前→後 | 決めた人 | 根拠 | 根拠 commit | 本文指紋 | メモ |
|---|---|---|---|---|---|---|---|
