---
id: <kebab-slug>            # 例: messages
title: メッセージ定義
type: design
kind: messages
arc42: 8
id_prefix: MSG
status: draft
canonical: true
owners: [eng]
created: YYYY-MM-DD
depends_on: [crosscutting]
relates_to: [api-spec, screen-spec, business-flow]
---

<!--
  arc42 §8 Crosscutting Concepts (横断概念) — arc42 公式の Content / Motivation / Form より訳出
  何を書く章か: 複数の構成要素にまたがる方針・パターン・規則・解決案。認証、エラー処理、ログ、国際化、区分値など。
  なぜ必要か: 概念の統一 (conceptual integrity) がシステム内部の品質を決める。各機能の設計書に散らすと必ずばらつく。
  書かない方がよいもの: 候補トピックの全部埋め。**必要なものだけ**を選んで節を立てる、と arc42 自身が明記している。
  出典: https://arc42.org/overview/ / https://docs.arc42.org/section-8/
-->

# メッセージ定義

> **TL;DR**: <利用者に出す文言の正典>
> - **文言をコードに直書きしない**。同じ事象に 2 通りの文言が出る状態を作らない
> - エラー文言は**次にすべき行動**を含める。「エラーが発生しました」だけの文言は不合格

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [横断概念](./crosscutting.md) / [業務フロー](./flows/) | XC-* / BF-* |
| 下流 | [API 仕様](./api/) / [画面設計](./screens/) | API-* / SCR-* |

## 1. エラーメッセージ一覧

| ID | コード | HTTP | 文言 (ja) | 文言 (en) | 対応ドメイン例外 | 出る画面 |
|---|---|---|---|---|---|---|
| MSG-001 | | | | | | |

## 2. 通知テンプレート一覧

<!-- 誰に・いつ・どの経路で送るか。送信失敗時の扱いは §3 -->

| ID | 通知 | チャネル | トリガ (BF) | 宛先 | 件名 / 本文の要点 |
|---|---|---|---|---|---|
| MSG-101 | | メール / LINE | BF-* | | |

## 3. 送信失敗時の扱い

| ID | 通知 | リトライ | 上限 | 失敗を利用者に見せるか | 記録 |
|---|---|---|---|---|---|
| MSG-101 | | | | | |

## 4. 文言の管理方針

<!-- どこに実体を置くか (i18n JSON / DB)。本書と実体がずれない仕組みを書く -->

| ID | 方針 | 実体の置き場 | ずれの検出方法 |
|---|---|---|---|
| MSG-201 | | | |
