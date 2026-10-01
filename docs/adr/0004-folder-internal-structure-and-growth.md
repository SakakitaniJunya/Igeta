---
id: adr-0004-folder-internal-structure-and-growth
title: ADR-0004 4フォルダの内部構造と、増えたときの分け方
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-01
depends_on: [adr-0001-document-role-directories]
relates_to: [context-boundaries, audience-directories]
---

# ADR-0004: 4フォルダの内部構造と、増えたときの分け方

> **TL;DR**: `decisions/`・`proposal/` (日付のある記録) は**年**で分ける。他の多数ファイル kind (runbook・
> how-to・explanation 等、常設文書) は年に意味が無いため**`context`** (既存フィールドを「運用する仕組み・主題」
> にも広げて使う) で分ける。閾値は**1フォルダ15本**で**違反**(新レイアウトの repo、既定強制)。kind 全数の
> 対応表・全体のフォルダ木 (正本) は [どの文書をどこに置くか](../explanation/10-folder-placement.md) §1・§3 に置く
> (本書は決定の核だけ)

## 関連

- **上流 (depends_on)**: ADR-0001
- **下流**: `src/core/Role.ts` / `src/checks/FolderSizeCheck.ts` (新設) / [どの文書をどこに置くか](../explanation/10-folder-placement.md)

## Status

2026-10-01 提案。director 指摘 (数値・鍵の誤りの訂正) を反映。arch-review 待ち。

## Context

CEO 原文: 「guides のルートにファイルを直で置いてくだけの脳死はやめてほしい」「decisions の肥大化も考慮して」。
director 実測: 利用 repo A は最大10本 (無害)、利用 repo B は design 配下1フォルダ33本・業務文書1フォルダ16本、
旧社内 repo は ADR35・guides26・runbooks21 本。CEO 原文「ルールとして設定して」により、警告ではなく違反にする。

## Decision Drivers

- 鍵は**書いた時点で決まり後から変わらないもの**。日付が意味を持つのは記録 (ADR/proposal) だけ
- 閾値は実測から決め、新レイアウトの repo では違反にする (CEO 原文どおりルール化する)
- 直下ファイル規則は kind ごとに1つの鍵が表 ([どの文書をどこに置くか](../explanation/10-folder-placement.md) §3) で決まっていることが前提

## Decision

**1. 鍵は2種類だけ**: 日付記録 (`adr`/`proposal`) は**年**。他の多数ファイル kind は**`context`**
(既存フィールドの意味を「運用する仕組み・主題」にも広げる。例: runbook の `context: deploy`)。固定単一ファイル
kind (function-list 等) は鍵自体が無い (増えない)。kind ごとの割当は [どの文書をどこに置くか](../explanation/10-folder-placement.md) §3 の表が正本

**2. 閾値15本・既定で違反**: 1フォルダ15本を超えたら、ADR-0005 のレイアウト検出と同じ条件 (新4フォルダが
実在する repo) で**即違反**にする (既定OFFの警告から変更。CEO 原文「ルールとして設定して」に応じる)。
15 は実測の全ての痛み (16・21・23・26・33・35本) を捉え、無害な実例 (10本以下) を誤検知しない最小値

**3. 直下ファイル規則 (1 文に言い直す)**: 文書を直下に置けるかどうかは、kind ごとの全数表
([どの文書をどこに置くか](../explanation/10-folder-placement.md) §3) の「直下可否」列だけで決まる。
`common/` の 7 フォルダを含め全フォルダに同じ 1 つの根拠が当てはまり、個別の列挙はしない
(前版の「decisions/specs/guides/delivery」列挙は `common/` の 6 フォルダを落としていた誤り)

**4. `ai/specs/`・`client/delivery/` の内部は変えない** (既に `screens/`・`api/` 等へ最初から分けている)

## 却下した選択肢

- **常設文書も年で分ける (前版の誤り)**: director 指摘のとおり年は記録にしか意味を持たない。「脳死」と同じになる
- **閾値を警告のみにする (前版の決定)**: CEO 原文「ルールとして設定して」に反する。実測を踏まえ違反へ変更
- **閾値を実装側の裁量にする**: 「守らせ方の無い条件は条件にしない」に反する

## Consequences

- 良い方向: ADR の参照が壊れない。新レイアウトの repo で平置きが実際に止まる (違反のため)
- 代償: `context` フィールドの意味を広げたため、既存の「業務のまとまり」という説明 (context-boundaries.md §1) に
  「運用する仕組み・主題」を追記する改訂が要る

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `FolderSizeCheck` (新設、新レイアウト検出で既定 violation) | 多数ファイル kind のフォルダ | 15本超で検出しない回帰 |
| `RoleBoundaryCheck` 拡張 (直下ファイル規則) | 全フォルダの直下 | 全数表の「直下可否」列に反する配置を違反にしない |

## 再検討トリガ

- `context` の意味拡張が運用で混乱を招いたら、専用フィールド (例: `subject`) を新設する案を再検討する
