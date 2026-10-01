---
id: adr-0005-enforcement-rollout-and-canonical-sync
title: ADR-0005 検査の既定切替・正典の一致・消費repo/scaffoldの追随
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-01
depends_on: [adr-0001-document-role-directories, adr-0002-role-boundary-invariants, adr-0003-docs-model-migration-and-dogfooding]
relates_to: [audience-directories]
---

# ADR-0005: 検査の既定切替・正典の一致・消費repo/scaffoldの追随

> **TL;DR**: 検査の強さはレイアウトの実在だけで決まる (設定で迂回できない): 新 4 フォルダが無い repo (旧レイアウト)
> は**毎回「`docs-migrate` を実行してください」と警告を出し**、次のメジャー版で違反へ切り替える (期限つき、
> CEO 確認は director が行う)。新 4 フォルダが 1 つでもあれば `RoleBoundaryCheck`/`AgentsEntrypointCheck`/
> `FolderSizeCheck`(15本閾値、ADR-0004) は全部**即違反**(CI 赤)。ルールの正典は文書体系ガイド 1 か所、
> コードの `Role.ts` はその転記であることを新設テストで固定する

## 関連

- **上流 (depends_on)**: ADR-0001 / ADR-0002 / ADR-0003
- **下流**: `src/core/Role.ts` / 新設 `TaxonomyGuideSync.test.ts` / `src/cli/commands/InitCommand.ts` / `ScaffoldCommand.ts`

## Status

2026-10-01 提案。CEO 指摘 (「でなおしたら、ルールとして設定してくださいね」) に基づく。arch-review 待ち。

## Context

移行しただけでは、次に書く文書が旧い書き方に戻る恐れがある。移行後の状態を**破れないルール**にする段取りが要る。
「人が設定を外すだけで迂回できる形にしない」(CEO) — `.igeta.json` のフラグで検査を切れる形は採らない。

## Decision Drivers

- 既定の切替は物理的なレイアウトの実在だけで判定し、人の設定操作で迂回できないこと
- ルールの正典は 1 か所。ガイドとコードが食い違ったら検査で落ちること
- Igeta の版を上げるだけで全消費 repo に効くこと (repo 側の個別作業を最小化する)

## Decision

**1. 検査既定の切替 (抜け道を塞ぐ)**: `docs/common`・`ai`・`person`・`client` のいずれかが実在する repo では
`RoleBoundaryCheck`・`AgentsEntrypointCheck`・`FolderSizeCheck`(ADR-0004、15本) を全部**即 violation** にする
(移行は配置を即座に正しくするため中間状態を想定しない)。**いずれも実在しない repo (旧レイアウト、移行しない
ことそのものが抜け道になっていた) では、検査のたびに「旧レイアウト。`igeta docs-migrate` を実行してください」と
警告を出し (非 blocking)、次のメジャーバージョンで違反に切り替える** (期限の明記。CEO への確認は director が行う)

**2. 正典の一致**: 文書体系ガイド (`templates/docs/guides/01-document-taxonomy.md`) の kind→置き場所表を正典とし、
`src/core/Role.ts` の `ROLE_OF_KIND` はその転記と明記する (既存 `Audience.ts` と同じ型)。新設テスト
`TaxonomyGuideSync.test.ts` がガイドの表を markdown から構造的に読み取り `ROLE_OF_KIND` と突き合わせ、
1 行でも食い違えば落ちる (既存の「転記してください」という手書きコメントだけの運用を機械検査へ格上げする)

**3. 消費 repo 側の追随**: CI 設定・各 repo の制約文書は手で書き換えない。Igeta の版を上げると `template-check`
が新チェックを含んで動くため、**repo 側の作業は `npm update` 相当のみ**。`AGENTS.md` は `docs-migrate` が
生成する。各 repo の制約文書 (「docs の構成規約を守る」に当たる条文) は文書体系ガイドを指す既存の参照のままで
よい (ガイド自体が改訂されるため、repo 側の文言変更は不要)

**4. `igeta init`/`scaffold`**: 新規 repo には最初から新 4 フォルダ構成を生成する (手で置いて間違える余地を
無くす)。旧レイアウトの雛形は削除する (新規作成に旧レイアウトを選ぶ理由が無い)

## 却下した選択肢

- **`.igeta.json` に `enforceRoleBoundary: true/false` を置く**: 外すだけで迂回できてしまう (CEO 指摘に反する)
- **移行済み repo に経過時間ベースの警告期間を置く**: 配置は移行コマンドが即座に正しくするため、移行済み repo に
  時限は要らない (未移行 repo 向けの版ゲート §1 とは別の話。版番号は迂回できない固定点で、経過時間とは異なる)
- **ガイドとコードの一致を人のレビューに委ねる (検査を新設しない)**: 「守らせ方の無い条件は条件にしない」に反する

## Consequences

- 良い方向: 既存 2 消費 repo は版を上げるだけで新ルールに追随する。新規 repo は最初から正しい
- 代償: `TaxonomyGuideSync.test.ts` はガイドの markdown 表を構造的に解析する実装が要り、ガイドの表の書式を
  変えると解析が壊れる可能性がある (表の列順を変えたら追随させる)

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `TaxonomyGuideSync.test.ts` (新設) | ガイド表 vs `ROLE_OF_KIND` | 1 kind でも置き場所が食い違う |
| `RoleBoundaryCheck`/`AgentsEntrypointCheck` のレイアウト検出テスト | 新 4 フォルダの有無 | 存在するのに検査が作動しない回帰 |
| `InitCommand`/`ScaffoldCommand` のテスト更新 | 新規生成物 | 旧レイアウトのパスを生成したら落ちる |
| 旧レイアウト警告のテスト (新設) | 新4フォルダが無い repo | 警告が出ない、または次期メジャーで違反に切り替わらない回帰 |

## 再検討トリガ

- `TaxonomyGuideSync` がガイドの表組みの変更に追随できず頻発に壊れたら、解析対象をコード生成 (ガイド側を
  `ROLE_OF_KIND` から生成する逆方向) に切り替える
