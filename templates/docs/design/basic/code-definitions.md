---
id: <kebab-slug>            # 例: code-definitions
title: 区分値定義
type: design
kind: code-definitions
arc42: 8
id_prefix: CD
status: draft
canonical: true
owners: [eng]
created: YYYY-MM-DD
depends_on: [domain-model]
relates_to: [table-spec, screen-spec, messages]
---

<!--
  arc42 §8 Crosscutting Concepts (横断概念) — arc42 公式の Content / Motivation / Form より訳出
  何を書く章か: 複数の構成要素にまたがる方針・パターン・規則・解決案。認証、エラー処理、ログ、国際化、区分値など。
  なぜ必要か: 概念の統一 (conceptual integrity) がシステム内部の品質を決める。各機能の設計書に散らすと必ずばらつく。
  書かない方がよいもの: 候補トピックの全部埋め。**必要なものだけ**を選んで節を立てる、と arc42 自身が明記している。
  出典: https://arc42.org/overview/ / https://docs.arc42.org/section-8/
-->

# 区分値定義

> **TL;DR**: <この案件で使う区分値 (enum) の正典>
> - **格納値と表示名を分ける**。表示名を DB に入れると文言変更が migration になる
> - 区分値の追加は本書を先に直す。コードと DB だけ足すのは禁止 (原則: 上流から直す)

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [ドメインクラス図](../detail/domain/) | class 名 |
| 下流 | [テーブル定義](./tables/) / [画面設計](./screens/) | TBL-* / SCR-* |

## 1. 区分値一覧

| ID | 区分 | 対応 enumeration クラス | 使用テーブル列 | 値の追加可否 |
|---|---|---|---|---|
| CD-001 | 予約状態 | ReservationStatus | reservations.status | 設計変更を伴う (状態遷移表も直す) |

## 2. 値の定義

### CD-001 予約状態

| 格納値 | 表示名 (ja) | 表示名 (en) | 意味 | 並び順 |
|---|---|---|---|---|
| tentative | 仮予約 | Tentative | | 10 |

## 3. 格納形式の方針

<!-- DB enum 型 / 文字列 + CHECK / 参照テーブル のどれを使うか。混在させない -->

| ID | 方針 | 理由 | 例外 |
|---|---|---|---|
| CD-101 | | | |

## 4. 表示名の解決 (任意)

<!-- i18n の辞書をどこに置くか。DB に持たせる場合は本書が SoT でなくなる点を明示する -->
