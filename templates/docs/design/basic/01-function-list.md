---
id: <kebab-slug>
title: 機能一覧
type: design
kind: function-list
arc42: 1
id_prefix: FN
status: draft
canonical: true
owners: [product, eng]
created: YYYY-MM-DD
depends_on: [requirements]
relates_to: [screen-spec, api-spec, test-spec]
---

<!--
  arc42 §1 Introduction and Goals (導入と目標) — arc42 公式の Contents / Motivation / Form より訳出
  何を書く章か: 機能要件の要約、開発の動機、最重要の品質目標 (最大 5 つ)、主要なステークホルダー。
  なぜ必要か: 利用者から見て「何の業務をどう良くするために作るのか」が、以降のすべての判断の前提になる。
  書かない方がよいもの: 要件文書の丸写し。要件文書があるなら参照し、抜粋は可読性が保てる最小限にする。
  出典: https://arc42.org/overview/ / https://docs.arc42.org/section-1/
-->

# 機能一覧

> **TL;DR**: <この一覧が網羅する範囲を 1 文で>
> - 機能の粒度は **画面 1 操作 = 1 機能**
> - REQ に紐づかない機能は作らない (紐づかないものは REQ 側に追加してから書く)

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [要件定義書](../../product/01-requirements.md) | REQ-* |
| 下流 | [画面設計](./screens/) / [API 仕様](./api/) / [権限マトリクス](./07-permission-matrix.md) / [テスト仕様](../test/specs/) | SCR-* / API-* / TST-* |

## 1. 機能一覧

<!-- 「対応 REQ」が空の行を作らない。空になる = 要件定義の漏れ -->

| ID | 機能名 | 概要 | アクター | 対応 REQ | 対応 SCR | 対応 API | 実装コンテキスト | 段階 |
|---|---|---|---|---|---|---|---|---|
| FN-001 | | | スタッフ | REQ-101 | SCR-001 | API-001 | reservation | Stage 1 |

## 2. 機能別の状態・権限

| ID | 参照可能なロール | 作成/更新可能なロール | テナント越境 | 備考 |
|---|---|---|---|---|
| FN-001 | | | 不可 | |

## 3. カバレッジ確認

<!-- REQ → FN の双方向。片方向だけ書くと漏れが見えない -->

| 確認 | 結果 |
|---|---|
| FN を持たない機能要件 REQ | なし / <列挙> |
| REQ に紐づかない FN | なし / <列挙> |
