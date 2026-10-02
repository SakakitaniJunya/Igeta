---
id: adr-0007-fingerprint-link-normalization
title: ADR-0007 指紋の正規化 v3 — リンクの行き先をパスではなく文書 id で数える
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-01
depends_on: [adr-0006-provenance-migration-handling]
relates_to: [adr-0006-provenance-migration-handling]
---

# ADR-0007: 指紋の正規化 v3 — リンクの行き先をパスではなく文書 id で数える

> **TL;DR**: 文書を別のフォルダへ動かすと、本文の相対リンクが書き換わり、指紋 (SHA256) が変わる。
> 中身が同じなのに由来は `stale`、合意は「再合意が要る」になる。そこで正規化を v3 に上げ、
> **相対リンクの行き先を、指す文書の frontmatter `id` に置き換えてから**指紋を取る。
> 既存の v2 の指紋は、v2 で今の本文と一致すると機械で確かめたものだけを v3 に載せ替える (承認は保つ)

## 関連

- **上流 (depends_on)**: ADR-0006 (移行時の付属ファイルの扱い)
- **下流**: `src/core/Fingerprint.ts` (正規化。正規化の決まりの解説にも実装時に v3 を追記する) / `igeta fingerprint-rebase` (新設)

## Status

2026-10-01 提案。

## Context

`normalizeForFingerprint` (`src/core/Fingerprint.ts`) は改行・行末空白・空白・表の整形だけを正規化し、
リンクの URL 文字列はそのまま残す。指紋の対象は 3 つある: 由来の正本側の節・行 (`SourceResolver.ts` の
`findSection`/`findDefinedRow` が生の本文を返す)、由来なし宣言の `blockFingerprint`、合意台帳の
`chapterFingerprint` (章そのもの)。どれも本文に相対リンクを含みうる。ADR-0004 で「15 本を超えたら
下位フォルダへ全部移す」と決めたので、文書は今後も動き続ける。動かすたびに顧客への再合意が出る仕組みは成り立たない。

## Decision Drivers

- リンク先のパスは内容ではない。リンク先の**文書が何か**は内容である
- 承認の記録 (`acceptedBy`、台帳の `approve`) を、機械の都合で作り直さない
- 台帳は追記のみ (08 §1)。過去の行を書き換えない

## Decision

**1. 正規化 v3**: v2 の 5 手順の後に 1 手順を足す。コードフェンスの外の Markdown リンク `[文字](行き先)` で、
行き先が docs/ 内の相対パスのとき、`[文字](id:<frontmatter id>#<アンカー>)` に置き換える。引けない行き先は次のとおり

| 行き先 | 扱い |
|---|---|
| 外部 URL (`https://` 等)・アンカーだけ (`#節`) | そのまま残す (移行で変わらない) |
| docs/ 内だが frontmatter `id` の無いファイル | repo 相対の正規パスに直して残す。移動で変わるので、`docs-migrate` は移行前に一覧で止める (ADR-0003 の「kind 無し文書は止める」と同じ扱い) |
| docs/ の外の実在ファイル (repo 直下の README.md 等) | repo 相対の正規パスに直して残す (id が無く置き換えられないが、リンク元の移動で相対パスは変わるため) |
| 存在しないファイル | そのまま残す (リンク切れは `docs-check` が別に落とす) |

パスから id を引く表は、`buildSourceIndex` が既に持つ `SourceDoc.relPath` と `id` から作る (新しい索引は要らない)

**2. 載せ替え (`igeta fingerprint-rebase`、新設)**: 版を上げただけでは、既存エントリは `needs-recompute` になる
(04 §6)。載せ替えは次の手順だけで行い、確認を省く経路は作らない。**正規化は版ごとの実装を消さずに残す**
(`normalizeForFingerprint(text, version)`。v2 の実装を v3 で上書きしない)。保存値の版で再計算できない
エントリは「確かめられない」として載せ替えず、版番号だけを見て一致とみなす代用は作らない

1. 各エントリの対象本文を **v2 で**計算し、保存値と比べる
2. 一致したもの (= 今 ok のもの) だけ、**同じ本文**から v3 の指紋を計算して載せ替える。sidecar のエントリには
   `fingerprint`・`normalizationVersion: 3` を書き、`rebasedFrom` (v2 の値)・`rebasedAt`・`rebasedBy: "igeta"` を足す。
   `acceptedBy`/`acceptedAt` は保つ
3. 一致しないもの (既に stale) は触らない。stale のまま人の確認に回る
4. 合意台帳は過去の行を書き換えず、`fingerprint-rebase` イベントを 1 行追記する。対応表は**指紋 1 つごと**に持つ
   (キー = 章ファイル + 対象。対象は `chapterFingerprint` か `sources[].from` の値。1 章に `sources` の数 + 1 本)。
   `agreement-check` (`AgreementCheck.ts` の `chapterFingerprint` と `sources[].fingerprint` の比較) は、
   「保存値と一致」**または**「直近の `fingerprint-rebase` がその保存値に対応づけた v3 値と一致」なら一致とする

**3. 移行との関係**: `docs-migrate` は**リンクを書き換える前に** `fingerprint-rebase` を実行する (書き換えた後では
v2 の一致を確かめられない)。移動の無い repo は `fingerprint-rebase` を単独で実行する

**承認の偽造にならない理由**: 載せ替えるのは、v2 で「今の本文 = 承認したときの本文」と機械で確かめたものだけ。
v3 はその同じ本文から計算するので、承認した内容と指紋が指す内容は同じまま。人が承認した事実は書き換えず、
指紋の計算方法だけを付け替える。確認に落ちたものは載せ替えない (台帳のファイルを手で書き換える操作は別で、解説 08 の限界)

## 却下した選択肢

- **行き先を落とす**: リンク先の付け替えを検出できない。**移行ごとに再承認**: 動かすたびに顧客へ再合意を求める。
  **リンクを書き換えない**: 移行後にリンクが切れる

## Consequences

- 良い方向: 何度動かしても中身が同じなら指紋は同じ。代償: 指紋が索引 (docs/ の走査) に依存し、id の変更は付け替え扱い

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `Fingerprint` の単体テスト (新設) | パスだけ違う 2 つ / リンク先の id だけ違う 2 つ | 前者で指紋が異なる / 後者で同じ |
| `fingerprint-rebase` のテスト (新設) | v2 で一致しないエントリ | 載せ替えてしまう |
| `docs-migrate` の完了条件 (ADR-0006) | 移行前後の `provenance-check`・`agreement-check` | ok・stale の件数が変わる |

## 再検討トリガ

- id の無い文書へのリンクが多く、移行で止まる件数が実案件で 10 件を超えたら、id の自動付与を検討する
