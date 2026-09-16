---
id: adr-0001-in-memory-persistence
title: ADR-0001 保存先をプロセス内メモリに限定する
type: adr
kind: adr
arc42: 9
status: accepted
canonical: true
owners: [eng]
created: 2026-09-16
proposed: 2026-09-16
accepted: 2026-09-16
depends_on: []
relates_to: [booking-requirements, sample-solution-strategy, sample-risks]
---

# ADR-0001: 保存先をプロセス内メモリに限定する

> **TL;DR**: 学習サンプルの保存先はプロセス内メモリだけとし、DB・マイグレーション・コンテナを持ち込まない。
> - 準備コマンドは `npm ci` の 1 つに収まる
> - 代償として、実行終了でデータは消え、トランザクションと行レベルセキュリティを検証できない
> - port と adapter の分離だけは残し、DB 採用時に use case を書き換えないで済むようにする

## 関連

- **上流 (depends_on)**: なし (サンプルの最初の決定)
- **下流**: [稼働構成 (AS-IS)](../architecture/01-overview.md) / [解決戦略](../design/basic/02-solution-strategy.md) / [リスクと技術的負債](../design/01-risks-tech-debt.md)

## Status

2026-09-16 accepted / 決定者: サンプル作成者。

## Context

このサンプルの目的は、設計書とコードと検査のつながりを 30〜45 分で体験させることにある。
DB を入れると、起動手順に Docker・接続文字列・マイグレーションが増え、学習の失敗点が設計書から離れる。

## Decision Drivers

- 準備の短さ (学習を始めるまでのコマンド数)
- 検査の再現性 (誰の環境でも同じ結果になるか)
- 実案件へ移すときの書き換え量

## Decision

**採用: メモリ adapter のみ**。理由: 準備を `npm ci` だけにでき、検査が環境に依存しないため。

| 判断軸 | メモリのみ | 理由 |
|---|---|---|
| 準備の短さ | 採用 | Docker・接続設定・マイグレーションが不要 |
| 再現性 | 採用 | 外部状態を持たず、実行ごとに初期状態から始まる |
| 書き換え量 | 条件付きで許容 | port を挟むため、adapter 差し替えで use case は無変更 |

## 却下した選択肢

- **SQLite ファイル**: 準備は軽いが、行レベルセキュリティを検証できないのにできそうに見える。
- **Docker + PostgreSQL**: 本番に近いが、起動失敗の原因が設計書と無関係になり学習が止まる。

## Consequences

- 良い方向: 準備が 1 コマンド。検査が数秒で終わり、失敗させて戻す練習ができる。
- 代償: トランザクション・行レベルセキュリティ・並行性を検証できない。テナント分離の検査はメモリ adapter 内の比較にとどまり、認可の代わりにはならない。

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `npm run sample:deps` | `examples/booking/src` | domain / application が npm パッケージや infrastructure に依存したとき |
| `npm run sample:test` | TST-201〜215 | メモリ adapter 前提の検査が壊れたとき |
| 目視レビュー | `package.json` | サンプル用スクリプトに DB 起動が増えたとき |

## 再検討トリガ

このサンプルで行レベルセキュリティか並行更新を扱う必要が出たとき。その場合は本 ADR を superseded にし、DB adapter の ADR を新規に書く。
