---
id: <kebab-slug>
title: テスト仕様
type: design
kind: test-spec
arc42: 10
id_prefix: TST
status: draft
canonical: true
owners: [eng]
created: YYYY-MM-DD
depends_on: [test-plan, function-list, api-spec]
relates_to: [screen-spec, sequence-spec]
---

<!--
  arc42 §10 Quality Requirements (品質要求) — arc42 公式の Content / Motivation / Form より訳出
  何を書く章か: 品質要求の全体像 (品質ツリー) と、測定可能な品質シナリオ。最重要のものは §1.2 に書いてあるので参照に留め、
    ここには「達成できなくても致命傷にならない」ものまで含めて広く書く。
  なぜ必要か: 品質要求はアーキテクチャ判断を大きく左右するため、具体的かつ測定可能な形で持つ必要がある。
  書かない方がよいもの: 「高速」「使いやすい」などの buzzword。数値と観測手段の無い品質要求は検証できない。
  出典: https://arc42.org/overview/ / https://docs.arc42.org/section-10/
-->

# テスト仕様

> **TL;DR**: <対象範囲を 1 文で>
> - 1 ケース = 1 判定。期待結果は **HTTP コード・件数・状態名**など機械判定可能な形で書く
> - REQ / FN / API のどれにも紐づかないケースは、要件側の漏れを疑う

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [テスト計画](../01-test-plan.md) / [機能一覧](../../basic/01-function-list.md) / [API 仕様](../../basic/api/) | FN-* / API-* |
| 下流 | 実装のテストコード (`*.spec.ts` / Playwright) | — |

## 1. テストケース一覧

| ID | 層 | 対象 | 前提 (Given) | 操作 (When) | 期待結果 (Then) | 対応 REQ/FN/API |
|---|---|---|---|---|---|---|
| TST-201 | E2E | 予約作成 | staff ログイン済 | 空き枠を指定して確定 | 201 / 状態 confirmed | REQ-101 / FN-001 / API-001 |
| TST-202 | 結合 | テナント隔離 | 2 テナントのデータ | 他テナント ID で取得 | 0 件 | NFR-201 |

## 2. 否定テスト (必須)

| ID | 観点 | ケース | 期待結果 |
|---|---|---|---|
| TST-301 | 認可 | 他テナントの ID を指定 | 403 |
| TST-302 | 競合 | 同一会議室・重なる時間帯を同時登録 | 一方が 409 |

## 3. トレーサビリティ

| 確認 | 結果 |
|---|---|
| テストを持たない FN | なし / <列挙> |
| テストを持たない API | なし / <列挙> |

## 4. テストデータ (任意)

| ID | データセット | 生成方法 | 個人情報の扱い |
|---|---|---|---|
