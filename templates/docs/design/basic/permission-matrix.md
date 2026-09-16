---
id: <kebab-slug>            # 例: permission-matrix
title: 権限マトリクス
type: design
kind: permission-matrix
arc42: 8
id_prefix: PRM
status: draft
canonical: true
owners: [eng]
created: YYYY-MM-DD
depends_on: [function-list, crosscutting]
relates_to: [api-spec, screen-spec, table-spec]
---

<!--
  arc42 §8 Crosscutting Concepts (横断概念) — arc42 公式の Content / Motivation / Form より訳出
  何を書く章か: 複数の構成要素にまたがる方針・パターン・規則・解決案。認証、エラー処理、ログ、国際化、区分値など。
  なぜ必要か: 概念の統一 (conceptual integrity) がシステム内部の品質を決める。各機能の設計書に散らすと必ずばらつく。
  書かない方がよいもの: 候補トピックの全部埋め。**必要なものだけ**を選んで節を立てる、と arc42 自身が明記している。
  出典: https://arc42.org/overview/ / https://docs.arc42.org/section-8/
-->

# 権限マトリクス

> **TL;DR**: <誰がどの機能を使えるかの 1 枚表>
> - **機能一覧・画面設計・API 仕様は本書を参照する**。同じ権限を 3 か所に書かない
> - 権限は「操作」だけでなく **データ範囲** (自テナント / 自分の予約) とセットで決める

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [機能一覧](./function-list.md) / [横断概念](./crosscutting.md) | FN-* / XC-* |
| 下流 | [API 仕様](./api/) / [画面設計](./screens/) / [テーブル定義](./tables/) | API-* / SCR-* / TBL-* |

## 1. ロール定義

| ID | ロール | 主体 | 認証方法 | 権限の SoT |
|---|---|---|---|---|
| PRM-001 | | | | |

## 2. ロール × 機能

<!-- 記号: R = 参照 / C = 作成 / U = 更新 / D = 削除 / — = 不可。空欄を残さない -->

| FN | 機能 | <ロール1> | <ロール2> | <ロール3> | データ範囲 |
|---|---|---|---|---|---|
| FN-001 | | | | | |

## 3. データ範囲の定義

| ID | 範囲名 | 適用条件 | 実装での担保 |
|---|---|---|---|
| PRM-101 | 自テナント | | RLS |

## 4. 越境が起きた時の応答

| ID | 状況 | 応答 | 記録 |
|---|---|---|---|
| PRM-201 | 他テナントの資源を指す ID を受けた | 404 (存在を漏らさない) | 監査ログ |
