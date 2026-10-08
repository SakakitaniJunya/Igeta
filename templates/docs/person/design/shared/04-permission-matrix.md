---
id: <kebab-slug>
title: 権限マトリクス
type: design
kind: permission-matrix
arc42: 8
id_prefix: PRM
status: draft
canonical: true
owners: [eng]
created: YYYY-MM-DD
line_limit: 100
depends_on: [function-list]
relates_to: [screen-spec]
---

# 権限マトリクス

> **TL;DR**: <誰がどの機能を使えるかの 1 枚表>
> - 他の文書は本書の ID を引く。同じ権限を別の文書に書かない
> - 権限は操作だけでなく、データ範囲 (自テナント・自分の予約) とセットで決める

## 1. ロールとデータ範囲の図

```mermaid
flowchart TB
  role1["ロール 1 (PRM-001)"] -->|"読み書き"| scope1["自テナント (PRM-101)"]
  role2["ロール 2"] -->|"参照のみ"| scope1
  role2 -->|"読み書き"| scope2["自分の予約"]
  role3["ロール 3"] -->|"参照のみ"| scope2
  role3 -->|"参照のみ"| scope1
```

## 2. ロール定義

| ID | ロール | 主体 | 状態 |
|---|---|---|---|
| PRM-001 | | | 仮 |

## 3. データ範囲の定義

| ID | 範囲名 | 適用条件 | 状態 |
|---|---|---|---|
| PRM-101 | 自テナント | | 仮 |

## 4. ロール × 機能

記号: R 参照 / C 作成 / U 更新 / D 削除 / — 不可

| ID | FN | 機能 | <ロール 1> | <ロール 2> | <ロール 3> | データ範囲 | 状態 |
|---|---|---|---|---|---|---|---|
| PRM-201 | FN-001 | | | | | PRM-101 | 仮 |

## 決めてほしいこと

| 問い | 対象 ID | 選択肢 | 決まらないと止まること |
|---|---|---|---|
| <決めてほしいことを 1 文で> | PRM-201 | <A / B> | <止まる設計・作業> |

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [機能一覧](./01-function-list.md) | FN-* |
| 下流 | (生成索引が出す) | — |
