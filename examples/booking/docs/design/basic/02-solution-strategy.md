---
id: sample-solution-strategy
title: 予約 CLI サンプルの解決戦略
type: design
kind: solution-strategy
arc42: 4
id_prefix: SS
status: draft
canonical: true
owners: [eng]
created: 2026-09-16
depends_on: [booking-requirements, sample-nonfunctional]
relates_to: [sample-infra-design, sample-crosscutting, adr-0001-in-memory-persistence]
---

# 予約 CLI サンプルの解決戦略

> **TL;DR**: 素の TypeScript でレイヤを分け、保存とイベント配信を port の裏に置いた学習用 CLI。
> - 決定は **ADR が正典**。本書はどの決定がどの品質目標に効くかの対応表
> - ここに無い構造を実装で増やさない。増やすなら本書と ADR を先に直す

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [要件定義](../../product/01-requirements.md) / [非機能要件](03-nonfunctional.md) | REQ-101〜107 / NFR-001〜301 |
| 下流 | [ドメイン総論](../detail/domain/01-overview.md) / [インフラ設計](08-infra-design.md) / [横断概念](04-crosscutting.md) | class 名 / INF-001 / XC-201 |

## 1. 技術選定の要約

| ID | 領域 | 採用 | 理由 (1 行) | 決定元 ADR |
|---|---|---|---|---|
| SS-001 | 言語 / ランタイム | TypeScript 5.9 / Node.js 22 | 型で不変条件の一部を落とせる。追加ランタイム不要 | — |
| SS-002 | 実行方式 | `tsx` による直接実行 | ビルド成果物を持たず、変更から実行までを短くする | — |
| SS-003 | 画面・HTTP | 採用しない | 設計書とコードの対応を学ぶのに不要 | — |
| SS-004 | 永続層 | プロセス内メモリ adapter | 準備を `npm ci` だけにする | [ADR-0001](../../adr/0001-in-memory-persistence.md) |
| SS-005 | イベント配信 | メモリ収集の adapter | 配信面を型で示し、購読側は持たない | — |

## 2. 分割方針

| ID | 論点 | 決め | 破ってはいけない線 |
|---|---|---|---|
| SS-101 | デプロイ単位 | Node.js プロセス 1 つ | プロセスを分けない (分けると検査が環境依存になる) |
| SS-102 | コンテキスト境界 | 業務コンテキストは booking のみ | 他コンテキストを増やすなら公開面はイベントだけ |
| SS-103 | レイヤ依存の向き | domain ← application ← infrastructure | domain は npm パッケージと外側の層を知らない |
| SS-104 | 集約境界 | Reservation と TimeSlot を分ける | 集約をまたぐ参照は id のみ ([ADR-0002](../../adr/0002-capacity-on-confirmation.md)) |

## 3. 品質目標の達成手段

| ID | 品質目標 (NFR) | 達成手段 | 機械で確かめる方法 |
|---|---|---|---|
| SS-201 | NFR-001 検査が短時間で終わる | 外部 I/O を持たず、テストはメモリ上で完結させる | `npm run sample:check` の所要時間 |
| SS-202 | NFR-101 同じ入力で同じ結果になる | 時刻は `now: () => Date` として注入する | TST-203 (注入時刻がイベントに入る) |
| SS-203 | NFR-201 テナントのデータが混ざらない | 全 port が TenantId を引数に取り、保存時に一致を検証する | TST-201 / TST-206 |
| SS-204 | NFR-202 図と実装がずれない | クラス図と domain の export を双方向照合する | `npm run sample:drift` |
| SS-205 | NFR-203 文書の表と実装の定義がずれない | 遷移表・メッセージ表をコードの定義と突き合わせる | TST-214 / TST-215 |
| SS-206 | NFR-301 レイヤ違反が混入しない | dependency-cruiser の規約を雛形から流用する | `npm run sample:deps` |

## 4. 主要な設計判断 (ADR 一覧)

| ADR | 決定 | 本書との関係 |
|---|---|---|
| [ADR-0001](../../adr/0001-in-memory-persistence.md) | 保存先をプロセス内メモリに限定する | SS-004 の根拠 |
| [ADR-0002](../../adr/0002-capacity-on-confirmation.md) | 枠の定員は確定時に消費する | SS-104 の根拠 |

## 5. 組織的な決定

学習用サンプルのため、運用体制・外部委託の決定は持たない。保守は Igeta リポジトリの変更と同じ流れで行う。
