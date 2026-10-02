---
id: <kebab-slug>            # 例: crosscutting
title: 横断概念
type: design
kind: crosscutting
arc42: 8
id_prefix: XC
status: draft
canonical: true
owners: [eng]
created: YYYY-MM-DD
depends_on: [nonfunctional, permission-matrix, data-management]
relates_to: []
---

<!--
  arc42 §8 Crosscutting Concepts (横断概念) — arc42 公式の Content / Motivation / Form より訳出
  何を書く章か: 複数の構成要素にまたがる方針・パターン・規則・解決案。認証、エラー処理、ログ、国際化、区分値など。
  なぜ必要か: 概念の統一 (conceptual integrity) がシステム内部の品質を決める。各機能の設計書に散らすと必ずばらつく。
  書かない方がよいもの: 候補トピックの全部埋め。**必要なものだけ**を選んで節を立てる、と arc42 自身が明記している。
  出典: https://arc42.org/overview/ / https://docs.arc42.org/section-8/
-->

# 横断概念

> **TL;DR**: <全機能に同じ形で効く方式を 1 文で>
> - ここに書いた形を**各機能で再発明しない**。違う形が要るなら本書を直す
> - 方式が従う決まり (権限・期間・言語) は `person/` の ID を引く。値を書き写さない

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [非機能要件](../../../person/design/shared/03-nonfunctional.md) / [権限マトリクス](../../../person/design/shared/04-permission-matrix.md) / [データの扱い](../../../person/design/shared/05-data-management.md) | NFR-* / PRM-* / DM-* |
| 下流 | API 仕様 (`ai/specs/<まとまり>/api/`) / モジュール仕様 (`ai/specs/<まとまり>/modules/`) | API-* / MOD-* |

## 1. 認証・認可

| ID | 対象 | 認証の方式 | 判定の単位 | 越境時の応答 | 従う権限 (PRM) |
|---|---|---|---|---|---|
| XC-101 | | | | 他テナントの資源を指す ID は 404 (存在を漏らさない) | PRM-101 |

## 2. エラー形式

<!-- HTTP ステータス / body スキーマ / ドメイン例外との対応を 1 つに固定する -->

| ID | 層 | 型 | 変換先 |
|---|---|---|---|
| XC-201 | | | |

## 3. ログ・監査

<!-- 構造化ログの必須フィールド。tenantId は最初から付ける (後付けだと過去ログを分離できない)。保持期間・個人情報の扱いは書かず、データの扱いの ID を引く -->

| ID | 種別 | 必須フィールド | 従う決まり (DM) |
|---|---|---|---|
| XC-301 | | | DM-201 |
| XC-302 | 越境の試み | tenantId・主体・対象の ID | DM-201 |

## 4. i18n・タイムゾーン

<!-- ここは方式の要約 1〜3 行。ロケール一覧・catalog・書式・翻訳フローの本体は 04-i18n.md に書く。対応する言語は非機能要件が決める -->

| ID | 対象 | 決め | 禁止事項 | 従う決まり (NFR) |
|---|---|---|---|---|
| XC-401 | | | | NFR-401 |

## 5. 冪等性・リトライ

| ID | 対象 | 冪等キー | リトライ可否 | 副作用の扱い |
|---|---|---|---|---|
| XC-501 | | | | |

## 6. テナント隔離

| ID | 層 | 方式 | 破れた時に起きること |
|---|---|---|---|
| XC-601 | | | |

## 7. レイヤの依存の向き

<!-- 層の間で依存してよい向きと、破ってはいけない線。依存方向は dependency-cruiser が CI で強制する -->

| ID | 層 | 依存してよい先 | 破ってはいけない線 |
|---|---|---|---|
| XC-701 | domain | なし (他の層に依存しない) | domain から infrastructure を import しない |

## 8. 品質目標の達成手段

<!-- 品質目標 (NFR) 1 件につき、どの構造で担保するかを 1 行。手段が無い目標は、手段が無いと書いて残す (原則: サイレント縮退禁止)。測り方はテスト計画 -->

| ID | 従う決まり (NFR) | 達成手段 | 確かめる層 (テスト計画) |
|---|---|---|---|
| XC-801 | NFR-001 | | |
