---
id: adr-0006-provenance-migration-handling
title: ADR-0006 由来sidecar・合意台帳・食い違いログの移行時の扱い
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-01
depends_on: [adr-0003-docs-model-migration-and-dogfooding]
relates_to: [adr-0007-fingerprint-link-normalization]
---

# ADR-0006: 由来sidecar・合意台帳・食い違いログの移行時の扱い

> **TL;DR**: 提出物のディレクトリは丸ごと 1 単位で動かし、書き換えるのは repo 相対のパス 2 つ (`sourceDoc`・`location`)
> だけ。リンクの書き換えで変わる指紋は正規化 v3 (ADR-0007) で守る。② の書き直しで再合意の対象の行に触るときは、
> 人が「顧客へ新しい版を出す」か「状態の列を足すだけにする」かを選ぶ。行を別の文書へ移すときは、文字が同じことを
> 確かめて由来の `from` を付け替え、台帳には付け替えの行を追記する (顧客への再合意を出さない)

## 関連

- **上流 (depends_on)**: ADR-0003
- **下流**: ADR-0007 (指紋の正規化 v3) / `igeta docs-migrate` の付属ファイルの書き換え・`igeta source-move` (新設)

## Status

2026-10-02 提案。04・05・08 の実装を読んで決めた。

## Context

提出物の章を `client/delivery/` へ移すとき、章のほかに 4 種のファイルが絡む: 由来 (`<章>.provenance.json`)・
合意台帳 (`agreements.ledger.jsonl`)・食い違いログ (`discrepancies.log.jsonl`)・export manifest (`deliverable.json`)。
どれも frontmatter を持たず検査の対象外なので、個別に扱いを決める。書き直しと、上限を超えたときの行の移動も
正本の行を変えるので、由来と合意に効く。

## Decision Drivers

- 台帳は追記のみ (08 §1) を移行でも破らない。由来の承認は人の仕事 (04 §4) で、移行が代わりに承認しない
- 中身を変えない操作 (移動・列の追加) で、顧客への再合意を出さない

## Decision

**1. 移動の単位は提出物ディレクトリ丸ごと**。manifest・章・由来・台帳・ログを分けない

**2. 書き換えない**: `deliverable.json` の `chapters`/`output` と台帳の `file` は提出物ディレクトリ基準の相対パスなので、
ディレクトリが丸ごと動けば変わらない。**3. 書き換える**: 由来の `sourceDoc` と食い違いログの `location` (repo 相対)

**4. 指紋とリンク**: 指紋は本文から計算するので、`docs-migrate` が本文の相対リンクを書き換えると v2 の指紋が変わる。
`docs-migrate` は**リンクを書き換える前に** `fingerprint-rebase` を実行し、v2 で一致を確かめた指紋だけを v3 に
載せ替える (ADR-0007)。由来の `from` は `<doc-id>/…` の形で、文書の id で解決するので、文書の移動では変わらない

**5. ① 移す段の完了条件**: 前と後で `provenance-check`・`agreement-check` を回し、ok・stale の件数が同じこと。
変わったら失敗として終了し、作業ツリーを `git` で戻す手順を出す (移行は commit しない)

**6. ② 書き直す段**: `reagreementRules` (既定は requirements、案件が足せる) に当たる行を書き直す前に、人が選ぶ。
(a) 書き直して、顧客へ新しい版を出し承認を取る (`agreement-check` の違反はその承認で解ける)。(b) 状態の列を足すだけにし、
他の文字を変えない (列を除いた行が元の行と一致し、元の v2 の指紋が保存値と一致することを `fingerprint-rebase` が
確かめて載せ替える)。当たらない行の書き直しで文字が変わったら、`docs-migrate --split-report` がその行を `from` に持つ
由来を一覧にし、人が同じ PR で再 capture・再 accept する (承認し直した人と日時は `acceptedBy`・`acceptedAt` に残る)

**7. 行の移動** (文書が上限を超えて、行を別の文書へ移すとき): 移した行の文字が元と同じことを指紋で確かめ、その行を
`from` に持つ由来の `from` を新しい文書の id へ付け替える。台帳は過去の行を書き換えず、`source-move` の行を追記する
(1 回の操作の移動は 1 行にまとめ、同時に適用する)。`agreement-check` はこの対応を通して照合する。文字が違えば
付け替えず、決定 6 に従う。移動は `igeta source-move` が、同じ ID で保存値と一致する行を探して見つける。
移した後に書き換えた行の再合意の規則は、提出したときの文書といまの文書の両方で判定し、どちらかが当たれば
再合意が要る (規則に当たらない文書へ移してから書き換えても、通知だけにならない)

**8. 台帳**: 上の 2 種 (`fingerprint-rebase`・`source-move`) のほかに、移行を示す行は追記しない

## 却下した選択肢

- **全部のパスを無条件に書き換える**: 正しい相対パスまで変えてしまう
- **書き直しで変わった由来を、移行コマンドが自動で再承認する**: 由来の承認は人の仕事。作る主体と裁く主体が同じになる
- **行の移動で再合意を出す**: 文書の大きさの都合で、顧客に同じ内容の承認を求めることになる

## Consequences

- 良い方向: 中身を変えない操作 (移動・列の追加・行の移動) では、顧客への再合意が出ない
- 代償: 移行コマンドは、適用前に提出物ディレクトリの完全性 (4 種が同じディレクトリにあるか) を検査する。
  指紋の安定は ADR-0007 の実装に依存する (v3 が入るまで移行を実行しない)

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| ① の前後の検査結果の比較 | `provenance-check`・`agreement-check` | ok・stale の件数が変わる |
| [テスト仕様 — 行の移動・状態の列](../design/test/specs/02-provenance-moves.md) | 列だけを足した行 / 別の文書へ移した行 / 移した後に書き換えた行 | 表のテストが 1 件でも落ちる |
| [テスト仕様 — 移行コマンド](../design/test/specs/07-docs-migrate.md) | 章・由来・台帳を持つテスト用の提出物 / `--split-report` | 表のテストが 1 件でも落ちる |

## 再検討トリガ

- Igeta 自身には提出物が無い。決定 5〜7 は fixture のテストで先に確かめ、最初の実案件の移行で実測する
