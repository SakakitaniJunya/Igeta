---
id: test-decision-migration
title: テスト仕様 — 決定の状態の移行・GitHub の差し込み口・実装の割り方
type: design
kind: test-spec
context: shared
arc42: 10
id_prefix: TST
status: draft
canonical: true
owners: [eng]
created: 2026-10-22
depends_on: [adr-0013-decision-status-folders]
relates_to: [test-decision-status]
---

# テスト仕様 — 決定の状態の移行・GitHub の差し込み口・実装の割り方

> **TL;DR**: [テスト仕様 10](./10-decision-status.md) の規則を、既存の repo に入れる手順 (Igeta 自身の ADR 12 本、利用側の ADR と DEC/OPEN の行) と、
> テストで `gh` を差し替える `GitHubPort`、実装 4 本それぞれが「入る時点で緑」である理由に落とす。根拠の無い承認済は作らない

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [ADR-0013](../../../../person/decisions/2026/0013-decision-status-folders.md) (決定 9・10) | — |
| 下流 | `src/cli/commands/decision/port.ts`・`src/core/decision/`・`DocsMigrate*` の 1 段 とそのテスト | TST-* |

## 1. GitHubPort (差し込み口)

`decision-*` は GitHub を `GitHubPort` 越しにだけ読む。本番は `gh api` を呼ぶ実装、テストは fixture の実装を渡す。git は一時フォルダの本物の repo を使う。

| メソッド | 返す値 | fixture の書き方 |
|---|---|---|
| `pull(repo, number)` | `state` (`open`・`closed`・`merged`)・`author`・`mergedBy`・`closedBy`・`mergeCommit`・`headRepo` | `pull/19: { state: 'merged', mergedBy: 'ceo-gh', mergeCommit: '<一時 repo の sha>' }` |
| `pullCommits(repo, number)` | その PR の commit の sha の配列 | `pull/19: ['<sha>', …]` (一時 repo で作った commit) |
| `issue(repo, number)` | `state`・`closedBy` | `issue/7: { state: 'closed', closedBy: 'ceo-gh' }` |

無い fixture は「見つからない」(検査不能 2)。`gh` が無い環境は、この口が検査不能を返す (TST-321)。

## 2. 移行

| 規則 | 内容 |
|---|---|
| MG1 | Igeta 自身の 12 本: 下の表の根拠で `decision-accept`。根拠の PR の本文の指紋と今の本文が違えば、後の PR を根拠にするか `amend` (accept は拒否) |
| MG2 | 利用側の `docs-migrate` の 1 段: `<年>/` の ADR を状態でフォルダへ移す。根拠の表 (id・名前・URL) がある ADR だけ accept。無い旧 accepted・旧 rejected は事象 `差戻し` で `proposed/` に置き、メモに旧い状態と日付、`awaiting` に `approvers` の先頭の名前を入れる |
| MG3 | 利用側の DEC・OPEN: 列を足す。DEC は状態 `決定`、根拠 `移行前 (未記入)`。OPEN は状態 `未決` (暫定値の列が埋まっていれば `暫定`)、持ち主に `approvers` の先頭の名前、期限 `未定`、根拠 `移行前 (未記入)`。値は移行の PR で人が直す (人の承認のパス)。直るまで DS13 は警告として数え、違反にしない |
| MG4 | 移行の印は、移行前に在った行だけ。新しい行に書けば DS13 の違反 (DS13 に書いた比べ方) |

| ADR | 根拠 (`gh` が実行時に再確認) | 先に要る作業 |
|---|---|---|
| 0001〜0010 | PR #19 (2026-10-05、`docs/adr/` に 10 本) | 0006・0007・0010 を、決まりの行から `ADR-NNNN` で引く (G4)。本文の指紋が違えば MG1 |
| 0011 | PR #20 (2026-10-08、99 行を追加) | なし (要件定義書 02 の行が引いている) |
| 0012 | PR #26 (2026-10-22) | 引く行を足す。#26 は GitHub のレビューが無い (AI の内部評価のみ) が、他と同じく merge で扱う |
| 0013 | 無し (proposed のまま) | この PR を CEO が merge した後に accept |

順: ① 引く行を `person/` に足す PR ② 記録の PR (`decision-accept` を 12 本分。状態のフォルダがここで初めて現れ、DS1・3・5・6 が効き出す) ③ 0013 の accept。①②は CEO の merge が要る。

## 3. テストケース一覧

| ID | 層 | 前提 (Given) | 操作 (When) | 期待結果 (Then) | 対応 |
|---|---|---|---|---|---|
| TST-401 | 結合 | 旧配置の 3 本 (accepted・rejected・proposed)。根拠の表は accepted だけ | `docs-migrate` | accepted は `accepted/<年>/`、旧 rejected は `proposed/` で `差戻し`・メモ・`awaiting` あり。docs-check 違反 0 | MG2 |
| TST-402 | 結合 | DEC 15 行・OPEN 17 行 | `docs-migrate` | 列が足り、移行の印の行は警告として数えられ、違反 0 | MG3 |
| TST-403 | 結合 | 移行済みの repo | `docs-migrate` を 2 回目 | 何も変えない | MG2・MG3 |
| TST-404 | 結合 | Igeta 自身の 12 本と、`GitHubPort` の fixture (#19・#20・#26) | `decision-accept` を 12 回 | 12 本が `accepted/2026/`。docs-check 違反 0 | MG1 |
| TST-405 | 結合 | 暫定値の列が埋まった OPEN | `docs-migrate` | 状態 `暫定`。空の行は `未決` | MG3 |

## 4. 否定テスト (必須)

| ID | 観点 (手口・境界) | ケース | 期待結果 |
|---|---|---|---|
| TST-501 | 印の悪用 | 移行後に新しい DEC 行へ `移行前 (未記入)` を書く | DS13 の違反 (MG4) |
| TST-502 | 根拠の取り違え | 根拠の表の URL が、その ADR を含まない PR | その 1 本だけ拒否 (1)。他は進まず全部戻す (MG1) |
| TST-503 | 手置き | 旧 accepted を根拠なしのまま `accepted/` に手で置く | DS3 の違反 (MG2) |
| TST-504 | 人の取り違え | 根拠の表の名前が `approvers` に無い | その 1 本を拒否 (1) (MG1) |
| TST-505 | 本文が変わった | #19 の後に本文が変わった ADR | accept は拒否 (1)。後の PR を根拠にするか `amend` (MG1) |
| TST-506 | 既存の repo を赤くしない | 状態のフォルダが無い repo で、手書きの `status: accepted` | DS12 の警告 1 件だけ。DS1・DS3 は効かない |
| TST-507 | 台帳の列なし | `状態` の列が無い台帳 | DS13 は効かない。移行後に列を消せば DS7 と同じ比べ方で違反 |
| TST-508 | 持ち主の補い | 差戻しの ADR の `awaiting` が `approvers` に無い名前 | DS11 の違反 |

## 5. トレーサビリティ

| 確認 | 結果 |
|---|---|
| 決定 → 規則 → テスト | ADR 決定 9 → MG1 → 404・502・504・505 / MG2 → 401・403・503 / MG3 → 402・405・507 / MG4 → 501 / 決定 10 → §6 (機械で確かめない) / DS12 の有効化の条件 → 506 / DS11 → 508 |
| 機械で確かめないもの | 移行の PR で人が持ち主・期限・根拠を直すこと / 実装 4 本の順 |

## 6. 実装の割り方

状態のフォルダを持つ repo だけで DS1・3・5・6 が効き (DS12)、DS13 は台帳に `状態` の列がある repo だけで効く。既存の repo は移行するまで赤くならない。

| 本 | 中身 | 入る時点で緑な理由 |
|---|---|---|
| 1 | `src/core/decision/` (DS1〜DS14)・索引の 4 つの表・`Role.ts` は旧い `<年>/` と新しい 4 フォルダの両方を許す・要件定義書 02 §7・ガイドを同時に直す | 状態のフォルダが無い repo (Igeta・八ヶ岳) は DS12 の警告だけ。`Role.ts` が両方を許すので雛形の検査は動く。`TaxonomyGuideSync` は同じ PR で揃える |
| 2 | 雛形 (履歴の節・台帳の列・README・`init` の AGENTS.md・人の承認の手引き)。`templates/` の再構成の後に差分だけ | 雛形は新しい配置に替わり、1 の `Role.ts` が許す。雛形に ADR の実物は無い |
| 3 | `src/cli/commands/decision/` (4 動詞・`pending`・`GitHubPort`) | 検査を変えず、新しいコードとテストだけ。Igeta の docs は変わらない |
| 4 | `docs-migrate` の 1 段、Igeta 自身の 12 本 (§2 の順)、利用側の移行 | 12 本は全部根拠付きで入り、DS1・3・5・6 が緑で効き出す。利用側は移行 PR ごとに緑にする |

MD-11 のフォルダ分け: `src/core/decision/` = `history.ts` (履歴の読み書き・遷移)・`fingerprint.ts`・`folder.ts` (置き場所と年)・`evidence.ts` (形と実在)・`ledger.ts` (DEC/OPEN)・`check.ts`・`index.ts` の 7 本。
`src/cli/commands/decision/` = `verbs.ts` (4 動詞の薄い入口)・`record.ts` (書き込み口)・`pending.ts`・`port.ts`・`ghPort.ts`・`index.ts` の 6 本。
読むのは `#decision/core`・`#decision/cli` (package.json の `imports`)。`cli/commands/` の直下は既に 7 本を超えているが (既存の負債)、足すのは `checkCommands.ts` への登録 1 行だけ。

## 7. 版の注意

- `ADR_STATUSES` (旧い構成) は変えず、`amended` は `ADR_STATUSES_V4` だけが持つ。新しい規則は新しい構成の repo だけに当たる
- `.igeta-version` で版を固定した repo は、固定を上げるまで DS1〜DS14 と `decision-*` を使えない。出力は、固定した版が新しい規則を持たないことを 1 行で知らせる
