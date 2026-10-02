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

> **TL;DR**: `docs-migrate` は提出物ディレクトリを**丸ごと1単位**で動かす (manifest・章・sidecar・台帳・
> ログを分割移動しない)。この前提なら manifest の `chapters`・台帳の `file` は自ディレクトリ相対のため
> **書き換え不要**。書き換えが要るのは repo 相対パスを持つ 2 つだけ: sidecar の `sourceDoc` と食い違いログの
> `location`。指紋はパスを含まないが、**本文の相対リンクが書き換わると変わる**。これは正規化 v3 (ADR-0007) で
> 防ぐ。① 移す段の完了条件は「前後で検査の結果が同じ」。② 書き直す段は文字が変わるので、影響を一覧にして人が承認し直す

## 関連

- **上流 (depends_on)**: ADR-0003
- **下流**: ADR-0007 (指紋の正規化 v3) / `igeta docs-migrate` の sidecar/ログ書き換え処理 (新設)

## Status

2026-10-02 提案 (書き直しの段の扱いを追加)。04・05・08 の実装を読んで決めた。arch-review 待ち。

## Context

提出物の章を `client/delivery/` へ移すとき、章のほかに 4 種のファイルが絡む: 由来 (`<章>.provenance.json`)・
合意台帳 (`agreements.ledger.jsonl`)・食い違いログ (`discrepancies.log.jsonl`)・export manifest (`deliverable.json`)。
どれも frontmatter を持たず、検査の対象外なので、個別に扱いを決める。

## Decision Drivers

- 提出物のディレクトリは、実装上すでに「章・由来・台帳・ログが同じディレクトリ」の前提で作られている
- 台帳は追記のみ (08 §1) を移行でも破らない。由来の承認は人の仕事 (04 §4) で、移行が代わりに承認しない

## Decision

**1. 移動の単位は提出物ディレクトリ丸ごと**: `deliverable.json`・章 `.md`・`.provenance.json`・
`agreements.ledger.jsonl`・`discrepancies.log.jsonl` を**分割しない 1 つの単位**として移動する

**2. 書き換え不要 (自ディレクトリ相対のため)**: `deliverable.json` の `chapters`/`output`、台帳の
`AgreementExportChapter.file` は、提出物ディレクトリ基準の相対パス。ディレクトリが丸ごと動けば相対関係は
変わらない。**書き換えない**

**3. 書き換えが要る (repo 相対パスのため)**: sidecar の `sourceDoc` (例: `docs/delivery/design-document/...`)と
食い違いログの `location` (`<repo相対パス>[#anchor]`)。この 2 つだけ新パスへ書き換える

**4. 指紋とリンク**: 指紋 (`chapterFingerprint`・`sources[].fingerprint`・`blockFingerprint`) はパスを含まないが、
本文から計算する。正本 (`person/` か `ai/specs/` へ動く) と章の本文にある相対リンクを `docs-migrate` が書き換えると、
中身が同じでも v2 の指紋は変わる (`Fingerprint.ts` はリンクの URL を正規化しない)。そこで `docs-migrate` は
**リンクを書き換える前に** `fingerprint-rebase` を実行し、v2 で一致を確かめた指紋だけを v3 に載せ替える
(ADR-0007)。由来の `from` は `<doc-id>/…` の形で、`SourceResolver.ts` が `byId` で解決するので移行で変わらない

**5. ① 移す段の完了条件**: 前と後で `provenance-check`・`agreement-check` を回し、ok・stale の件数が同じこと。
変わったら失敗として終了し、作業ツリーを `git` で戻す手順を出す (移行は commit しない)

**6. ② 書き直す段の扱い**: 再合意の対象 (既定は requirements、08 §5) の正本の行は、状態の列を足すだけにし、
他の文字を変えない。列の追加は `fingerprint-rebase` が機械で確かめて載せ替える (状態の列を除いた行が元の行と
一致し、元の行の v2 の指紋が保存値と一致するときだけ。ADR-0007 と同じ手順)。それ以外の書き直しで文字が変わった
行は、`docs-migrate --split-report` が、その行を `from` に持つ由来のエントリを一覧にする。人が同じ PR で再 capture と
再 accept を行う。誰がいつ承認し直したかは、由来のエントリの `acceptedBy`・`acceptedAt` に残る

**7. 台帳**: 移行で過去の行を書き換えず、移行を示す行も追記しない (§2 の相対パスは移行後も解決できる)

## 却下した選択肢

- **台帳に「移行した」行を追記する**: 台帳の正しさに影響せず、読む人の負担だけが増える
- **全部のパスを無条件に書き換える**: 正しい相対パスまで変えてしまう
- **書き直しで変わった由来を、移行コマンドが自動で再承認する**: 由来の承認は人の仕事。作る主体と裁く主体が同じになる

## Consequences

- 良い方向: 書き換え対象が2種類だけに絞られ、移行コマンドの実装・検証範囲が小さくなる
- 代償: 「提出物ディレクトリを分割しない」という前提が破られる実装ミスがあれば、§2 の省略が誤りになる。
  移行コマンドは適用前に提出物ディレクトリの完全性 (4 種のファイルが同一ディレクトリに揃っているか) を検査する。
  指紋の安定は ADR-0007 の実装に依存する (v3 が入るまで移行を実行しない)

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| ① の前後の検査結果の比較 (`docs-migrate` の完了条件) | `provenance-check`・`agreement-check` | ok・stale の件数が変わる |
| `--split-report` のテスト (新設) | 書き直した正本の行を指す由来 | 文字の変わった行を指すエントリを一覧に出さない |
| 状態の列の載せ替えのテスト (新設) | 状態の列だけを足した要件の行 | 載せ替えずに再合意が要ると判定する / 他の文字も変えた行を載せ替える |
| 提出物を含む fixture での移行テスト (新設) | 章・sidecar・台帳を持つテスト用の提出物 | 移行後に stale・要再合意が出る |
| sourceDoc/location 書き換えテスト (新設) | sidecar・食い違いログ | repo 相対パスが新パスに揃っていない |
| 提出物ディレクトリ完全性検査 (新設) | 移行対象の delivery-chapter 群 | 4 種のファイルが分散しているのに適用へ進む |

## 再検討トリガ

- Igeta 自身には提出物が無い。§5 の比較は fixture のテストで先に確かめ、最初の実案件の移行で実測する
