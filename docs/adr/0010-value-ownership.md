---
id: adr-0010-value-ownership
title: ADR-0010 値の持ち主は 1 つ — 人の決める値は person の行に置き、ai は ID を引く
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-02
depends_on: [adr-0009-kind-placement]
relates_to: []
---

# ADR-0010: 値の持ち主は 1 つ — 人の決める値は person の行に置き、ai は ID を引く

> **TL;DR**: いまの雛形は kind の中に人の決定と作り方が混ざる (例: インフラ設計に月額の費用、状態遷移に期限)。
> 人の決める値は `person/` の kind の行に 1 回だけ書き、`ai/` の文書はその ID を引いて従う (値を書き写さない)。
> `ai/` の文書に未決の節を置かない。雛形の再編の PR では、ai の雛形の全部の節に置き場所の問いを当て、
> 「変わる」が 0 件であることを確かめる

## 関連

- **上流 (depends_on)**: ADR-0009 (kind の置き場所)
- **下流**: `templates/docs/**` の再編 (ADR-0005 決定 4) / `data-management` の雛形 (新規)

## Status

2026-10-02 提案 (round 2 の FIX-1・2 を受け、解説から決めを移し、漏れていた節を足した)。arch-review 待ち。

## Context

kind 単位の振り分け (ADR-0009) は、kind の中身が 1 種類のときだけ正しい。雛形の節を 1 つずつ問いに当てると、
ai の kind に人の決める値が、person の kind に作り方が残っていた。

## Decision Drivers

- 1 つの値の持ち主は 1 つ (2 か所に書けば必ずずれる)。新しい kind は足さない

## Decision

**1. ai の雛形から person へ移す値**

| ai の kind (いまの節) | 移す値 | 移す先 (person) |
|---|---|---|
| infra-design (§5) | 月額の費用 | solution-strategy の新しい節「費用の上限」 |
| infra-design (§1.1・§1.2) | C4 の L1・L2 (利用者・外部・コンテナ) | solution-strategy の図 (ai は配置・経路・権限の図だけ) |
| infra-design (§1.5・§1.6)・crosscutting (§3)・table-spec (§2 の保持期間・§6・§11) | 保持期間・越境・個人情報・削除の方針・バックアップ・環境ごとのデータ | data-management |
| test-plan (§2)・test-spec (§4) | テストデータの個人情報 | data-management の環境ごとの扱いに従う |
| messages (§2) | 通知の宛先・タイミング・手段 | business-flow の行 |
| messages (§1・§2) | 約束や法令になる文 (規約・キャンセル規定・料金の表示・同意の文) | business-flow / screen-spec の行 (1 文) |
| i18n (§1・§4) | 対応する言語、多言語にする出口 | nonfunctional |
| test-plan (§3) | リリースしてよい条件 | migration-plan |
| state-machine (§2・§3・§5)・sequence-spec (§3)・domain-model (§2) | 業務の決まりに当たる期限・許す操作・例外の扱い・不変条件 | business-flow / requirements の行 |
| code-definitions (§2) | 表示名 | glossary の語 |
| external-integration (雛形なし) | 使う外部サービスと渡すもの | solution-strategy / data-management |
| secrets-management (雛形なし) | 鍵の入れ替えの方針 | nonfunctional |
| domain-overview (§4)・domain-model (§6)・i18n (§7) | 未決 | person の「決めてほしいこと」 |

`data-management` の雛形 (新規): 持つデータの区分 / 個人情報 / 保持期間 / 越境 / 削除の求めへの対応 / 環境ごとの扱い。

**2. person の雛形から ai へ出すもの**

| person の kind | 出すもの | 出す先 (ai) |
|---|---|---|
| business-flow | 権限の技術的な中身・入出力・検知の方法・システムの扱い・起動の方式・冪等性 | sequence-spec / job |
| screen-spec | 項目の定義・ローディングの形・応答コード・定型の文言 | コードが正本 (文言は messages) |
| function-list / solution-strategy | 対応 API の列 / レイヤの向き・品質目標の達成手段・ADR 一覧 | api-spec / crosscutting・test-plan / 決定台帳 |
| nonfunctional / permission-matrix | 実装手段・検証と測定の方法 / 認証方法・実装での担保・越境時の応答 | crosscutting / test-plan |
| operations / migration-plan | バックアップの方式・監視の設定・切り分け・デプロイ手順 / 手順と検証・切戻しの手順 | runbook / infra-design (閾値は nonfunctional に残す) |
| glossary / as-is-overview | 英語識別子 / 稼働中の資源の一覧 | domain-model / infra-design |

**3. 依存の向き (雛形の frontmatter)**: operations → nonfunctional・data-management、migration-plan → operations・data-management、
permission-matrix → function-list (ai を指さない)。infra-design → solution-strategy・nonfunctional・data-management・operations、
crosscutting → nonfunctional・permission-matrix・data-management、code-definitions → domain-model・glossary (ai が person に従う)。
person の雛形の `relates_to` から ai の kind を外し、「関連」の下流の欄は「(生成索引が出す)」と書く。
context-map §3 は隣の context-map を指す

**4. 線引き**: 約束や法令になる文は person の行に 1 文で書き、定型の文言のカタログは ai に置く (ai は person の ID を引く)。
ai の文書に「未決」「未確定」の節を置かない (人の決めが要るものは person の「決めてほしいこと」に書き、ai は ID を引く)

## 却下した選択肢

- **混ざった kind を丸ごと person に置く**: 作り方の詳細が人の読む量を押し上げる (インフラ設計の雛形だけで 171 行)
- **値を両方に書く**: 必ずずれる。どちらが正しいか機械も人も判断できない

## Consequences

- 良い方向: 人が決める値は全部 `person/` にあり、AI はその ID に従う。代償: 雛形の大半と、既存の文書の書き直し (ADR-0003 の②) に同じ移し替えが要る

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| 雛形の再編 PR の受入条件 | ai の雛形の全部の節 | 置き場所の問いに「変わる」と答える節が 1 つでも残る (節ごとの表を PR に付け、arch-review が確かめる) |
| `RoleBoundaryCheck` | ai の文書 | 「未決」「未確定」の節がある |

## 再検討トリガ

- 書き直した実案件で、同じ値が person と ai の両方に現れたら、その値の持ち主を本表に足す
