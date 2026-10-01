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
relates_to: [provenance-and-agreement, agreement-ledger, coverage-and-learning, export-deliverable]
---

# ADR-0006: 由来sidecar・合意台帳・食い違いログの移行時の扱い

> **TL;DR**: `docs-migrate` は提出物ディレクトリを**丸ごと1単位**で動かす (manifest・章・sidecar・台帳・
> ログを分割移動しない)。この前提なら manifest の `chapters`・台帳の `file` は自ディレクトリ相対のため
> **書き換え不要**。書き換えが要るのは repo 相対パスを持つ 2 つだけ: sidecar の `sourceDoc` と食い違いログの
> `location`。指紋はパスを含まないが、**本文の相対リンクが書き換わると変わる**。これは正規化 v3 (ADR-0007) で
> 防ぐ。移行の完了条件は「移行前後で `provenance-check`・`agreement-check` の結果が同じ」

## 関連

- **上流 (depends_on)**: ADR-0003
- **下流**: ADR-0007 (指紋の正規化 v3) / `igeta docs-migrate` の sidecar/ログ書き換え処理 (新設)

## Status

2026-10-01 提案。arch-review FIX 3 に基づく新設。04・05・08 の実装 (`ProvenanceSidecar.ts`・`AgreementLedger.ts`・
`DiscrepancyLog.ts`・`Manifest.ts`) を読んで決めた。arch-review 待ち。

## Context

`docs-migrate` が delivery-chapter を `client/delivery/` へ移すとき、章本体以外に 4 種のファイルが絡む:
由来 sidecar (`<章>.provenance.json`)・合意台帳 (`agreements.ledger.jsonl`)・食い違いログ
(`discrepancies.log.jsonl`)・export manifest (`deliverable.json`)。いずれも frontmatter を持たず
`DocGraphCheck`/`RoleBoundaryCheck` の対象外のため、個別に扱いを決める必要がある。

## Decision Drivers

- 提出物ディレクトリは実装上すでに「章・sidecar・台帳・ログが同じディレクトリ」という前提で作られている
  (各ファイルの header コメント参照)
- 台帳は追記のみ・改変しない契約 (08 §1) を migrate でも破らない
- 指紋の再計算・再承認を migrate に持たせない (由来の承認は人の仕事、04 §4)

## Decision

**1. 移動の単位は提出物ディレクトリ丸ごと**: `deliverable.json`・章 `.md`・`.provenance.json`・
`agreements.ledger.jsonl`・`discrepancies.log.jsonl` を**分割しない 1 つの単位**として移動する

**2. 書き換え不要 (自ディレクトリ相対のため)**: `deliverable.json` の `chapters`/`output`、台帳の
`AgreementExportChapter.file` は、提出物ディレクトリ基準の相対パス。ディレクトリが丸ごと動けば相対関係は
変わらない。**書き換えない**

**3. 書き換えが要る (repo 相対パスのため)**: sidecar の `sourceDoc` (例: `docs/delivery/design-document/...`)と
食い違いログの `location` (`<repo相対パス>[#anchor]`)。この 2 つだけ新パスへ書き換える

**4. 指紋とリンク**: 指紋 (`chapterFingerprint`・`sources[].fingerprint`・`blockFingerprint`) はパスを含まないが、
本文から計算する。正本 (`ai/specs/` へ動く) と章の本文にある相対リンクを `docs-migrate` が書き換えると、
中身が同じでも v2 の指紋は変わる (`Fingerprint.ts` はリンクの URL を正規化しない)。そこで `docs-migrate` は
**リンクを書き換える前に** `fingerprint-rebase` を実行し、v2 で一致を確かめた指紋だけを v3 に載せ替える
(ADR-0007)。由来の `from` は `<doc-id>/…` の形で、`SourceResolver.ts` が `byId` で解決するので移行で変わらない

**5. 完了条件と取り消し**: 移行の前と後で `provenance-check`・`agreement-check` を回し、ok・stale の件数が
同じであることを `docs-migrate` の完了条件にする。件数が変わったら失敗として終了し、作業ツリーの変更を
`git` で戻す手順を出力する (移行は commit しない。commit は人が結果を見てから行う)

**6. 台帳への追記**: しない。**過去の行も書き換えない**。台帳が記録する相対パスは移行後も正しく解決できるため
(§2)、移行を示す行の追記は不要と判断する

## 却下した選択肢

- **台帳に「移行した」イベントを追記する**: §2 の理由により台帳の正しさに影響しないため、追記する理由がない。
  追記すると「何が変わったか」を台帳から読み解く人の負担が増える
- **sidecar・ログの全パスを無条件に書き換える**: §2 の自ディレクトリ相対パスまで書き換えると、書き換え後も
  正しいパスを誤って別の値に変えてしまうリスクがある (変えなくてよいものは変えない)
- **本文が変わる場合に migrate が自動で再 capture する**: 由来の承認は人の仕事 (04§4)。機械が無人で再承認すると
  「作る主体と裁く主体を分ける」不変条件 (ADR-0002 #8) に反する

## Consequences

- 良い方向: 書き換え対象が2種類だけに絞られ、移行コマンドの実装・検証範囲が小さくなる
- 代償: 「提出物ディレクトリを分割しない」という前提が破られる実装ミスがあれば、§2 の省略が誤りになる。
  移行コマンドは適用前に提出物ディレクトリの完全性 (4 種のファイルが同一ディレクトリに揃っているか) を検査する。
  指紋の安定は ADR-0007 の実装に依存する (v3 が入るまで移行を実行しない)

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| 移行前後の検査結果の比較 (`docs-migrate` の完了条件) | `provenance-check`・`agreement-check` | ok・stale の件数が変わる |
| 提出物を含む fixture での移行テスト (新設) | 章・sidecar・台帳を持つテスト用の提出物 | 移行後に stale・要再合意が出る |
| sourceDoc/location 書き換えテスト (新設) | sidecar・食い違いログ | repo 相対パスが新パスに揃っていない |
| 提出物ディレクトリ完全性検査 (新設) | 移行対象の delivery-chapter 群 | 4 種のファイルが分散しているのに適用へ進む |

## 再検討トリガ

- Igeta 自身には提出物が無い。§5 の比較は fixture のテストで先に確かめ、最初の実案件の移行で実測する
