---
id: sample-crosscutting
title: 予約 CLI サンプルの横断概念
type: design
kind: crosscutting
arc42: 8
id_prefix: XC
status: draft
canonical: true
owners: [eng]
created: 2026-09-16
depends_on: [sample-nonfunctional]
relates_to: [sample-messages, sample-code-definitions, sample-module-booking]
---

# 予約 CLI サンプルの横断概念

> **TL;DR**: エラー・テナント隔離・時刻・イベント配信の扱いを 1 形式に固定し、各機能で作り直さない。
> - ここに書いた形を各機能で再発明しない。違う形が要るなら本書を直す
> - 未整備のもの (認証・ログ・冪等キー) は未整備と書く。それらしい記述で埋めない

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [非機能要件](03-nonfunctional.md) | NFR-201〜203 |
| 下流 | [メッセージ定義](06-messages.md) / [モジュール仕様](../detail/modules/01-booking.md) | MSG-001 / MOD-001 |

## 1. 認証・認可

| ID | 対象 | 方式 | 判定単位 | 越境時の応答 |
|---|---|---|---|---|
| XC-101 | CLI 実行 | 未実装 (ローカル実行のみ) | — | — |
| XC-102 | テナント越境の保存 | 保存時に集約のテナントと引数を比較 | 集約 1 件 | `TENANT_MISMATCH` (403 相当) |

XC-101 は未整備。外部公開する場合は認証と認可の設計が先に必要になる。

## 2. エラー形式

| ID | 層 | 型 | 変換先 |
|---|---|---|---|
| XC-201 | domain | `Result<T, DomainError>` (throw しない) | application で `toAppError` が変換 |
| XC-202 | application | `AppError` (code・statusCode・details を持つ) | CLI では標準出力、HTTP 面では例外フィルタ (未実装) |
| XC-203 | 変換規則 | `error-catalog.ts` の statusCode に従う | 400 → ValidationError / 403 → ForbiddenError / 404 → NotFoundError / 409 → ConflictError |
| XC-204 | 未登録コード | カタログに無い code は 409 として扱い、元の code を details に残す | TST-205 で検証 |

## 3. ログ・監査

| ID | 種別 | 必須フィールド | 保持期間 | 個人情報の扱い |
|---|---|---|---|---|
| XC-301 | CLI 出力 | 手順番号・操作結果・エラーコード | 保持しない (標準出力のみ) | 個人情報を扱わない (ID は固定のサンプル値) |

構造化ログ・監査ログは未整備。導入する場合は tenantId を最初から必須フィールドに入れる。

## 4. i18n・タイムゾーン

| ID | 対象 | 決め | 禁止事項 |
|---|---|---|---|
| XC-401 | 文言 | 日本語のみ。実体は `error-catalog.ts` | ドメインや CLI に文言を直書きしない |
| XC-402 | 時刻 | `Date` を UTC で扱い、現在時刻は `now: () => Date` で注入する | 実装内で `new Date()` を直接呼ばない (検査が再現しなくなる) |

## 5. 冪等性・リトライ

| ID | 対象 | 冪等キー | リトライ可否 | 副作用の扱い |
|---|---|---|---|---|
| XC-501 | 予約作成 | 未整備 (同一 ID の再作成は上書き保存になる) | 可 (結果は同じ) | 重複作成の拒否は未実装。[リスク](../01-risks-tech-debt.md) RSK-102 |
| XC-502 | 確定・キャンセル | 予約 ID + 現在状態 | 不可 (2 回目は遷移拒否で 409) | 状態を変えない |

## 6. テナント隔離

| ID | 層 | 方式 | 破れた時に起きること |
|---|---|---|---|
| XC-601 | application | 入力の tenantId を `TenantId` に変換してから port へ渡す | 検証前の文字列が保存キーに混ざる |
| XC-602 | infrastructure | テナント ID をキーにした二段の Map。保存時に集約のテナントと比較 | 別テナントの予約が読める・書ける |

行レベルセキュリティに相当する仕組みは無い。XC-602 はメモリ adapter 内の検証に限られる。
