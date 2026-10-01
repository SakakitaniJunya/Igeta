---
id: docs-model-migration-and-dogfooding
title: ADR-0003 移行手段・旧レイアウトの扱い・Igeta 自身の dogfooding
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-01
depends_on: [document-role-directories, role-boundary-invariants]
relates_to: [audience-directories, export-deliverable]
---

# ADR-0003: 移行手段・旧レイアウトの扱い・Igeta 自身の dogfooding

> **TL;DR**: 移行は dry-run コマンドが列挙し、適用は人手。旧レイアウトはレイアウト検出 (新フォルダの有無) で
> opt-in するためフラグ不要。既存 explanation 8 本は移さず、今回は ADR-0001/0002 の抜き出しのみ。
> Igeta 自身の dogfooding と 2 消費 repo への適用順序は後続実装タスク。
> - **後方互換の期限と 2 消費 repo への適用タイミングは未決 (CEO)** — 機械的に決める材料が無い

## 関連

- **上流 (depends_on)**: ADR-0001 / ADR-0002
- **下流**: `igeta docs-migrate` (新設、dry-run 既定) / [文書体系ガイド](../../templates/docs/guides/01-document-taxonomy.md) §2・§3 改訂 / Igeta 自身の docs/ 移行 (後続実装)

## Status

2026-10-01 提案。arch-review 待ち。

## Context

[要件定義書—読み手別ディレクトリ](../product/02-audience-directories.md) の未確定事項 #3 (移行手段) ・#4 (旧レイアウト検出強度) ・
 #6 (内部構造) ・ #7 (dogfooding) と、director 診断 1 (Igeta 自身に design/ が 0 本、決定が explanation に分散) に答える。

## Decision Drivers

- 既存 2 消費 repo を無警告で赤くしない
- 書き換え漏れを人の確認無しに自動適用しない (由来・合意台帳と同じ「検査を通ってから」の型)
- Igeta 自身が dogfooding できない設計を他社には勧めない

## Decision

**採用:**

1. **内部構造**: 既存 kind 別サブフォルダ (`product/` `design/basic/` 等) はそのまま、`specs`/`decisions`/`guides`/`delivery`
   の下に 1 段深く入れる
2. **既存 explanation 8 本**: 移動・ADR 化しない。今回新設する ADR-0001/0002 だけが「決定」を持つ。explanation 側は
   そのまま背景資料として残す (「explanation=決定の材料、決定は adr/」という元々の定義に戻すだけ。既存 6 本の
   遡及 ADR 化は別タスク・スコープ外)
3. **移行手段**: `igeta docs-migrate [<dir>] --dry-run` (既定・唯一の動作) がファイル移動・相対リンク書き換え・
   export manifest の chapter パス書き換え・repo 直下の `AGENTS.md` 新設の一覧を出す。適用は人手。理由: `fix-ids`/
   `discrepancy-add` と同じ「検査が通ってから人が適用する」既存の型を踏襲
4. **旧レイアウトの検出**: フラグを置かず、`docs/specs` `docs/decisions` `docs/guides` `docs/delivery` が
   1 つも存在しない repo は新設検査 (`RoleBoundaryCheck`・`AgentsEntrypointCheck`) を実行しない。4 つのうち
   1 つでも存在すれば新レイアウトとみなし全面的に検査する (既存案の「警告/違反/opt-in フラグ」のどれでもなく、
   レイアウトの実在で自動判定する)
5. **Igeta 自身の dogfooding**: 本 ADR 確定後、(a) `docs-migrate --dry-run` の実装 (b) Igeta 自身の docs/ への
   適用 + `AGENTS.md` の新設 (c) `docs:graph`/`docs:check` 再生成で検証、の順で別タスクとして実施する
   (本 ADR は実施しない、設計のみ)

**未決 (CEO)**: 旧レイアウトの後方互換に期限を切るか (切るなら日付か次メジャーバージョンか)、既存 2 消費 repo へ
いつ適用するか (dogfooding 完了後か、各 repo の現行作業に合わせて個別判断か)。実際の案件スケジュールの優先度が要る。

## 却下した選択肢

- **移行をコマンドで自動適用まで行う**: 相対リンクは自由記述で正規表現の取りこぼしがあり得る。人の確認を一度も
  経ない自動適用は由来・合意台帳の原則に反する
- **旧レイアウトを明示フラグ (`--new-layout`) で切り替える**: フラグを足し忘れると検査が働かないサイレント縮退になる
- **既存 explanation 8 本を全部 design/ へ移し ADR 化する**: 今回のタスク範囲 (読み手別配置) を超えるスコープクリープ

## Consequences

- 良い方向: 既存 2 消費 repo は何もしなければ何も壊れない。Igeta 自身が自分の設計を運用して検証できる
- 代償: `docs-migrate` の実装が 1 本増える。explanation 8 本の「遡及 ADR 化」は積み残しになる

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `docs-migrate --dry-run` の出力を diff で確認 (人手) | 移行対象 repo | 一覧に無いリンクが移行後に壊れている (`docs:check` のリンク実在検査で検出) |
| レイアウト検出ロジックのユニットテスト (新設) | `docs/specs` 等の有無判定 | 新規フォルダ 1 つだけ作った repo で検査が作動しない/しすぎる |

## 再検討トリガ

- 2 消費 repo への適用後、`docs-migrate` の書き換え漏れが 1 件でも実測されたら、dry-run 一覧の網羅性を見直す
- explanation の積み残し ADR 化を別タスクとして着手する条件: 設計判断を含む explanation を参照したレビューで
  食い違いが実際に起きたとき
