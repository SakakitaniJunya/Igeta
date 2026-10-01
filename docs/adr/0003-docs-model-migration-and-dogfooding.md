---
id: adr-0003-docs-model-migration-and-dogfooding
title: ADR-0003 移行コマンド (適用まで) と対象範囲
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-01
depends_on: [adr-0001-document-role-directories, adr-0002-role-boundary-invariants]
relates_to: [audience-directories, export-deliverable]
---

# ADR-0003: 移行コマンド (適用まで) と対象範囲

> **TL;DR**: `igeta docs-migrate` は dry-run で列挙するだけでなく**適用まで行う** (ファイル移動・相対リンク
> 書き換え・`AGENTS.md` 新設)。CEO 決定により「当てる」が確定: 対象は **Igeta 自身 → 既存の消費 2 repo**。
> 大規模な社内 repo (ADR 35 本) は凍結予定のため対象から外す (director が CEO へ確認)
> - 既存 explanation 8 本は移さず ADR 化しない (今回は ADR-0001/0002/0004 の抜き出しのみ)
> - 内部構造・肥大化対策は ADR-0004 に分離した (本書は移行コマンドと対象範囲のみ)

## 関連

- **上流 (depends_on)**: ADR-0001 / ADR-0002
- **下流**: `igeta docs-migrate` (新設) / Igeta 自身の docs/ 移行 / 2 消費 repo への適用

## Status

2026-10-01 提案。CEO 決定 (「直してくれ」) により「既存 repo へ当てる」が確定。arch-review 待ち。

## Context

当初は移行を dry-run のみとし適用は人手の想定だったが、CEO 指摘: 「35 本規模を人手で動かす前提は成り立たない」。
適用まで行うコマンドへ設計を直す。対象の優先順位も CEO 決定: Igeta 自身が先、2 消費 repo が次。大規模な社内 repo
(ADR 35 本) は凍結予定のため対象外とする想定 (director が CEO へ確認してから最終化)。

## Decision Drivers

- 35 本規模は人手の書き換えが現実的でない (適用まで機械化する)
- 既存 2 消費 repo・Igeta 自身を無警告で赤くしない (検査の既定切替は ADR-0005)
- 凍結予定の repo に工数をかけない

## Decision

**採用:**

1. **既存 explanation 8 本**: 移動・ADR 化しない (元々の「explanation=決定の材料、決定は adr/」の定義に戻すだけ)
2. **移行コマンド**: `igeta docs-migrate <dir> [--dry-run]`。**既定は適用**。(a) ファイル移動 (b) 本文中の相対リンク
   書き換え (c) README 索引・export manifest の chapter パス書き換え (d) 新設 kind→読み手対応表に基づく配置
   (e) `AGENTS.md` が無ければ新設、を一括で行う。`--dry-run` を付けたときだけ一覧のみ出して適用しない
   (dry-run が既定ではなくなった点が前版からの変更)
3. **適用前の安全策**: 適用前に git の作業ツリーが clean であることを要求し (汚れていれば検査不能で中断)、
   適用後に `docs:check`/`docs:graph` を自動で走らせ、失敗したら変更内容を報告する (ロールバックは git の責務とし
   コマンド自身は行わない)
4. **旧レイアウトの検出**: フラグを置かず、`docs/common` `docs/ai` `docs/person` `docs/client` が 1 つも無い
   repo は新設検査を実行しない。1 つでもあれば新レイアウトとみなす
5. **対象範囲と順序**: ① Igeta 自身 → ② 既存の消費 2 repo。大規模な社内 repo (ADR 35 本) は凍結予定のため対象外
   (director が CEO に確認してから最終化。確認が取れるまでは②に含めない)
6. **kind 無しの文書**: `docs-migrate` は止めて一覧を出す。**推定で黙って置かない**。人が frontmatter に `kind`
   を付けてから再実行する (利用 repo B 実測: design 配下 33 本中 32 本・業務文書 19 本中 19 本が kind 無し)
7. **製品の設計書でない業務文書 (経理・人事・事業計画等)**: Igeta の体系の対象外と宣言する。`.igeta.json` の
   `nonDocPaths` (新設、glob 配列) に列挙し、`docs-migrate`・新設検査はこのパス配下を丸ごと無視する
8. **版が古い repo (0.2.0 等) の手順**: ① Igeta を最新版へ更新 ②`igeta analyze --list-unmanaged` (新設) で
   kind 無し文書を一覧し、人が kind を付与するか `nonDocPaths` へ回す ③ 全件解決してから `docs-migrate` を実行
   (②が残っている間は③を拒否する)

## 却下した選択肢

- **dry-run のみ、適用は人手 (前版の決定)**: CEO 指摘により撤回。35 本規模は人手前提が成り立たない
- **大規模な社内 repo も含めて一括移行**: 凍結予定の repo に工数をかける理由が無い。凍結が解除されたら別途移行する
- **旧レイアウトを明示フラグで切り替える**: フラグを足し忘れると検査が働かないサイレント縮退になる

## Consequences

- 良い方向: 35 本規模でも機械的に移行できる。Igeta 自身が最初の適用対象になり dogfooding を兼ねる
- 代償: 適用まで行うコマンドはリンク書き換えの正規表現漏れのリスクを人手版より負う (安全策 §3 で緩和)。
  大規模 repo の凍結確認が取れるまで、その repo への適用計画は保留のまま

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `docs-migrate` 適用後の `docs:check`/`docs:graph` 自動実行 | 移行対象 repo | 壊れたリンク・索引が残っていたら検査が落ちる |
| git clean チェック (新設) | 適用前の作業ツリー | 未コミットの変更があれば中断 (検査不能) |
| kind 無しファイルの事前検査 (新設) | 移行対象 repo | 1 件でも残っているのに `docs-migrate` が適用へ進む回帰 |

## 再検討トリガ

- 2 消費 repo への適用後、書き換え漏れが 1 件でも実測されたら正規表現の網羅性を見直す
- 大規模 repo の凍結が解除されたら、対象に含めて計画を立てる
