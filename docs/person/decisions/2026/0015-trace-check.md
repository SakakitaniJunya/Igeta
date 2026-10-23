---
id: adr-0015-trace-check
title: ADR-0015 設計書のつながり (ID の上流・下流) を検査する — 新設の TraceCheck が既存の部品を import し、基準ファイルで段階的に厳しくする
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-23
depends_on: [adr-0002-role-boundary-invariants, adr-0004-folder-internal-structure-and-growth]
relates_to: []
---

# ADR-0015: 設計書のつながりを検査する — 新設の `TraceCheck` が既存の部品を import し、基準ファイルで段階的に厳しくする

> **TL;DR**: 決定 (DEC)・要件 (REQ)・機能 (FN)・画面 (SCR)・API・表 (TBL)・テスト (TST)・コードの ID が、上流と下流で届くかを機械で見る。
> 検査は新設の `TraceCheck` 1 つにし、ID の形・決まりの表・行の読み方は既存の `core/` から import する。
> 既存の違反は基準ファイルに記録し、新しい違反だけを落とす。基準は減らす方向にしか動かせない。
> - 却下: `DocGraphCheck` を広げる (ファイルが大きく、別の作業が触っている) / 既存の `SourceCoverageCheck` に足す (見る軸が違う)
> - 雛形の書き直し・番号の補助 (`igeta id next`) は テスト仕様 13・14 (docs/ai/specs/shared/tests/) で決める

```mermaid
flowchart TB
  core[core: DecisionRows・MarkdownTable・LineClassifier・Frontmatter] --> trace[TraceCheck 新設]
  trace --> graph[ID の索引: 定義と参照]
  graph --> rules[規則 T1〜T11: 上流・下流の必須参照]
  rules --> base[基準ファイル: 減らす方向だけ]
  base --> out[違反と警告・trace の木]
  docgraph[DocGraphCheck 変えない] -.-> trace
```

## 関連

- **上流 (depends_on)**: ADR-0002 (人の文書の境界。人の文書は AI の文書を指さない)・ADR-0004 (フォルダの構成)
- **下流**: テスト仕様 13 (規則・テストケース)・テスト仕様 14 (雛形・利用 repo への当て方・番号の補助)。どちらも docs/ai/specs/shared/tests/ にある。人の文書からはファイル名で言及し、リンクしない (G1: 人の文書は AI の文書を指さない)

## Status

2026-10-23 提案。方針は CEO が決めた (対象 8 種・ID はコードのヘッダ行・段階導入は基準方式)。

## Context

- 利用 repo の設計書で、決定から画面へは届いていたが、要件と機能一覧の行が無い。画面が指す機能は一部だけで、関係する機能が抜けていた。API の文書は機能だけを指し、画面や決定へ戻れなかった。表は 1 度もコードから参照されていなかった。
- 手で調べて直した。機械で見えないと、次の改修でまた抜ける。
- 既存の検査は、文書の frontmatter と本文リンクの向き (`DocConnections`・G1〜G4) と、配達章の行の網羅 (`SourceCoverageCheck`) を見る。ID を表の行で参照し合う関係は見ていない。
- 既存の ID の形は `core/DecisionRows.ts` の `idOf` が 1 か所に持つ (英大文字で始まる英数字の接頭辞 + `-` + 3 桁)。`SourceCoverageCheck` は同じ形を別の正規表現で持つ (接頭辞に数字を許さない)。二重定義である。

## Decision Drivers

1. 既存の違反を一度に直せなくても、新しい違反は入れない
2. 検査の部品は 1 か所だけに持つ (MD-06)。`DocGraphCheck` の中身は写さない
3. 人が読んで直せる出力 (○・△・✗ の木と、直す行の場所)

## Decision

**採用: 新設 `src/checks/TraceCheck.ts` (中身は `core/` の部品を import)。基準ファイルで段階的に厳しくする。**

1. 検査は 1 つの Check にする。ID の索引 (定義と参照) を作り、規則 T1〜T11 を当てる。`DocGraphCheck` は触らない。
2. 辺は「下流の行が上流の ID を書く」で宣言する。上流の行が下流を書く必要は無い。両方向の辺が揃わないものは △ にする (片方向)。
3. コードは先頭の 1 行 (MD-09 の概要の行) に `@trace` の後で ID を書く。対象のファイルは利用 repo の `.igeta.json` の glob で決める。
4. 違反は基準ファイル (`.igeta-trace-baseline.json`、repo 直下) に記録する。新しい違反だけを落とす。基準を増やすのは、基準ファイルが `origin` の基準より増えたときに落とす (`GitRef` で比べる)。
5. `trace <ID>` のコマンドを出す。既定は ○・△・✗ の木。`--mermaid` で Mermaid も出す。

| 判断軸 | 採用案での扱い | 理由 |
|---|---|---|
| 既存との重複 | ID の形・表・行の読み方は import。規則は新規 | 写すと 2 か所で食い違う (MD-06) |
| 段階導入 | 基準は減る方向だけ | 既存違反を一度に直さずに、新しい違反を止める |
| 書き方 | 先頭行に `@trace` | 既存の概要行 (MD-09) と兼ねる。行数を増やさない |

## 却下した選択肢

- **`DocGraphCheck` を広げる**: 生成索引と frontmatter の検査で既に大きい。別の作業が触っている。ID の表の検査は軸が違う。
- **`SourceCoverageCheck` に足す**: 配達章と sidecar の網羅を見る検査で、文書内の ID の上流・下流は見ない。接頭辞の形も違う。
- **外部ツールとして別に作る**: ID の形と表の読み方を二重に持つ (MD-06 に反する)。

## Consequences

- 良い方向: 抜けが見えるようになり、直す行が出る。基準は減るだけなので、後戻りが起きない。
- 代償: 辺の書き方を文書に増やす必要がある。`SourceCoverageCheck` の ID の形 (接頭辞に数字を許さない) は残るので、二重定義の解消は別の作業で決める。

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| テスト仕様 13 の正常・抜け・片方向・書き間違いのケース | `TraceCheck` | 規則 T1〜T11 のどれかが期待と違う |
| 基準の検査 | `.igeta-trace-baseline.json` | 基準が `origin` の基準より増えている |
| 利用 repo での実行 | 利用 repo の全文書 | 基準に無い違反が 1 件でもある |

## 再検討トリガ

- 辺を両方向で書く負担が大きく、△ が 3 回続けて直らなかったら、片方向の扱いを改める
- `SourceCoverageCheck` と ID の形が 2 回食い違って見つかったら、統一の作業を始める

## 決めてほしいこと

- 基準ファイルの置き場 (repo 直下か、`docs/` の中か)。この ADR は repo 直下にしている。
- **ID-NEXT**: `igeta id next` を作るか。費用は約 150 行 (git の参照を読むだけ)、効果は衝突の一部 (push 前の番号は見えない)。先に T1 の検査で衝突件数を 1 か月計り、多ければ作る。
