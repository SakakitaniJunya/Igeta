---
id: adr-0004-folder-internal-structure-and-growth
title: ADR-0004 フォルダの中はまとまりで分け、増えたときの分け方をフォルダごとに 1 つに決める
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-01
depends_on: [adr-0001-document-role-directories]
relates_to: [context-boundaries, folder-placement, template-realignment]
---

# ADR-0004: フォルダの中はまとまりで分け、増えたときの分け方をフォルダごとに 1 つに決める

> **TL;DR**: いまの決まりと作り方は、最初からまとまり (`context`) のフォルダに置く。まとまりに属さないものは
> `shared/` (これも 1 つのまとまりとして扱う)。日付のある記録 (ADR・提案書) は年で分ける。1 フォルダ 15 本を
> 超えたら違反。超えたときの分け方はフォルダごとに 1 つで、場当たりの分け方を許さない

## 関連

- **上流 (depends_on)**: ADR-0001
- **下流**: `src/core/Role.ts` / `src/checks/FolderSizeCheck.ts` (新設) / [置き場所](../explanation/10-folder-placement.md) / [雛形の組み直し](../explanation/11-template-realignment.md) §4

## Status

2026-10-02 提案 (ADR-0001 v4 に追随。arch-review v4 round 1 の FIX を反映)。arch-review 待ち。

## Context

フォルダの直下に文書を並べるだけの構成は、実測で 16〜35 本の平置きを生んでいた (設計 1 フォルダ 33 本、
ADR 35 本など)。問題の無い repo は最大 10 本だった。人も AI も「1 つのまとまりだけ読めば作業できる」ためには、
読む単位がフォルダとして見えている必要がある。

## Decision Drivers

- 分ける鍵は、書いた時点で決まり後から変わらないもの。フォルダが、そのまま読む単位になること
- 上限は実測から決め、新しい構成の repo では違反にする

## Decision

**1. 鍵は 2 種類だけ**: いまの決まりと作り方は**まとまり** (`context`)、日付のある記録 (`adr`・`proposal`) は**年**。
`context` の意味は「業務のまとまり」1 つだけで、主題 (デプロイなど) には使わない。`context` 無記入は `shared`。
フォルダ名と frontmatter の `context` が食い違えば違反。kind ごとの割当は [置き場所](../explanation/10-folder-placement.md) §3

**2. 1 フォルダ 15 本で違反**: 新しい構成の repo で、1 フォルダの文書が 15 本を超えたら違反。15 は、問題の
起きた実例 (16・21・23・26・33・35 本) を全部捉え、問題の無い実例 (10 本以下) を捉えない値。日付のある記録の
フォルダ (`decisions/<year>/`・`proposals/<year>/`) は対象外 (束で読まず、1 本ずつ承認する記録だから)

**3. 超えたときの分け方 (フォルダごとに 1 つ)**

| フォルダ | 超えたとき |
|---|---|
| `person/design/<context>/{flows,screens,features}/` | まとまりを分ける合図。下位フォルダは足さない |
| `person/design/shared/` の固定の文書 (100 行超) | 行を、属するまとまりの `design/<context>/NN-<kind>.md` へ移す |
| `person/requirements/01-requirements.md` (150 行超) | まとまりごとに `requirements/<context>.md` へ分ける |
| `ai/specs/tasks/`・`ai/handbook/{how-to,explanation,runbooks}/` | まとまりの下位フォルダ (`shared` を含む) へ全部移す |

**4. 直下の決まり**: 文書を置ける場所は [置き場所](../explanation/10-folder-placement.md) §1 の木だけで決まる。
木に無い場所 (例: `docs/person/` の直下) に置いたら違反。docs/ 直下に置けるのは生成索引の 2 本だけ

**5. まとまりの境界 (07) の改訂**: まとまりをフォルダで表すため、07 の決めを 6 か所改める。一覧は
[雛形の組み直し](../explanation/11-template-realignment.md) §4 (フォルダ化、kind 解決のパスの型、`shared` の扱いと
`sharedKinds` の廃止、地図同士の参照、`context-files` の範囲、手引きを境界検査の対象外にする)

## 却下した選択肢

- **手引きや常設の文書も年で分ける**: 年は記録にしか意味を持たない。平置きと同じく、探す手がかりにならない
- **`context` を主題 (デプロイなど) にも使う**: 業務のまとまりと主題が混ざり、境界検査が主題を業務のまとまりとして裁く
- **上限を警告だけにする**: 「ルールとして設定して」に反する。15 本は実測がある値なので違反にする

## Consequences

- 良い方向: 平置きが止まる。フォルダを開けば、そのまとまりの読むものが全部そろう
- 代償: まとまりを分けると文書が動く (由来の指紋は ADR-0007 で動いても変わらない)。kind の解決を、
  まとまりの 1 段だけワイルドカードにしたパスの型へ変える実装が要る

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `FolderSizeCheck` (新設) | 日付の記録以外のフォルダ | 16 本目を違反にしない |
| `RoleBoundaryCheck` (新設) | 3 フォルダ配下 | 木に無い場所の文書、フォルダ名と `context` の食い違いを違反にしない |

## 再検討トリガ

- `shared/` が 15 本を超え続ける repo が出たら、全体共通の文書の切り方を見直す
