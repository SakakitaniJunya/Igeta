---
id: <kebab-slug>            # 例: job-hold-expiry
title: ジョブ仕様 — <ジョブ群>
type: design
kind: job
arc42: 6
id_prefix: JOB
status: draft
canonical: true
owners: [eng]
created: YYYY-MM-DD
context: <context>          # このまとまり自身の名前 (kebab)。フォルダ名と同じにする
depends_on: [business-flow]
relates_to: [operations, infra-design, state-machine]
---

<!--
  arc42 §6 Runtime View (実行時ビュー) — arc42 公式の Contents / Motivation / Form より訳出
  何を書く章か: 実行時の振る舞いをシナリオで示す章。定期実行・起動停止などの運用シナリオもここに含まれる。
  なぜ必要か: 画面や API を持たない処理は、書かれていないと設計レビューにも見積りにも現れず、運用開始後に事故として現れる。
  書かない方がよいもの: 監視・当番・通知先などの運用手順 (→ §7 運用設計 / Runbook)。本書は「何が動くか」まで。
  出典: https://arc42.org/overview/ / https://docs.arc42.org/section-6/
-->

# ジョブ仕様 — <ジョブ群>

> **TL;DR**: <定期・非同期で動く処理を 1 文で>
> - **冪等キーの無いジョブを作らない**。再実行で二重に効く処理は必ず壊れる
> - 失敗は握りつぶさない。通知先と閾値は `person/` の非機能要件が決め、再実行の手順は手順書に書く (原則: サイレント縮退禁止)

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | 業務フロー (`person/design/<まとまり>/flows/`) / 状態遷移 (`ai/specs/<まとまり>/state-machines/`) | BF-* / STM-* |
| 下流 | [運用設計](../../../../person/design/shared/08-operations.md) / [インフラ設計](../../shared/05-infra-design.md) | OPS-* / INF-* |

## 1. ジョブ一覧

| ID | ジョブ | 目的 | 従う決まり (BF-2xx の期限) | トリガ | スケジュール | 実行基盤 |
|---|---|---|---|---|---|---|
| JOB-001 | | | BF-201 | 時刻 / イベント / 手動 | (cron 式・JST) | Cloud Scheduler → Cloud Run jobs |

## 2. 冪等性と再実行

<!-- 「同じ入力で 2 回動いても結果が 1 回ぶん」を何で保証するかを書く。無いなら「無い」と書いて設計を直す -->

| ID | 冪等キー | 重複実行時の挙動 | 再実行の安全性 | 最大実行時間 |
|---|---|---|---|---|
| JOB-001 | | | | |

## 3. 失敗時の扱い

<!-- 通知先は非機能要件の監視の閾値 (NFR-3xx) が決める。ここはリトライと上限だけ -->

| ID | 失敗の種類 | リトライ | 上限 | 従う決まり (NFR-3xx の通知) | 放置した場合に起きること |
|---|---|---|---|---|---|
| JOB-001 | | | | NFR-301 | |

## 4. 権限とデータ範囲

<!-- ジョブは利用者セッションを持たない。テナント境界を誰がどう張るかを明示する -->

| ID | 実行 role | テナント範囲 | RLS の張り方 |
|---|---|---|---|
| JOB-001 | | | |

## 5. 観測 (任意)

<!-- 正常の閾値は非機能要件の行を引く -->

| ID | 指標 | 従う決まり (NFR の閾値) |
|---|---|---|
