---
id: provenance-and-agreement
title: 由来・鮮度の形 (delivery-chapter 限定)
type: explanation
kind: explanation
status: active
canonical: true
owners: [product, eng]
created: 2026-09-30
depends_on: [audience-layers]
relates_to: [coverage-and-learning, agreement-ledger]
---

# 由来・鮮度の形 (delivery-chapter 限定)

> **TL;DR**: 由来・鮮度は既存 kind **`delivery-chapter`** (提出物の章、PR #11) **だけ**に課す。
> 由来は本文に書かず **sidecar** (`<章>.provenance.json`) に置き、既定粒度は **H2 節** (表の行は任意)。
> 鮮度は保存した状態を信用せず都度 SHA256 で再計算し、`self-approved`/`orphan` も違反にする。
> 顧客との合意台帳は [別紙](./08-agreement-ledger.md) に分けた (04 の行数上限のため)。

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [読み手別の入口](./03-audience-layers.md) | — |
| 下流 | [網羅・学習](./05-coverage-and-learning.md) / [合意台帳](./08-agreement-ledger.md) / `templates/docs/client/delivery/__deliverable__/__chapter__.md` | — |

## 1. 由来 (provenance) の形 — 本文の外のどちらにするか

| 案 | 検討 |
|---|---|
| 本文内 `## 由来` 節 / 行コメント | 節単位にしかならず export の `omitSections` 変更が要る。行コメントは `AUTOGEN` 以外の HTML コメントが PDF に文字で出る既知不具合があり、`AUTOGEN` も行単位の範囲除去でしか効かない |
| **sidecar ファイル (採用)** | export の `manifest.chapters` に載らないので `forbid`/`omitSections`/`html:false` に一切触らずゼロ変更で済む |

## 2. kind と置き場所

`client-chapter` は新設せず、既存 `delivery-chapter` (`templates/docs/client/delivery/__deliverable__/__chapter__.md`、PR #11) に統一する。
由来・台帳も提出物と同じ場所に置く: 実案件は `docs/delivery/<提出物名>/` (例: `docs/delivery/design-document/`) の
ように deliverable.json より 1 段深いことが多い。kind 解決 (ディレクトリ完全一致 + ファイル名ワイルドカード) は
`docs/delivery/` 直下の 1 段しか登録されておらず、この 1 段深い置き場所は**パスから kind を決められない**。
そのため `delivery-chapter` を名乗る文書は **frontmatter `kind: delivery-chapter` の明示を必須**にする
(既存の「宣言が置き場所と食い違えば違反」の仕組みは活きるが、置き場所からの既定値には頼らない)。

## 3. 由来の粒度

既定は **H2 節** (「関連」節を除く)。表の行単位まで割るのは**任意** (由来+指紋の件数を抑える。Böckeler/marmelab
の批判 (§ [読み手別の入口](./03-audience-layers.md) §2) と同じ理由で、既定を細かくしすぎない)。数値の正しさを
特に確かめたい行だけ、著者が判断して行単位のエントリを足せる。

## 4. sidecar の形

`<basename>.provenance.json` を章と同じディレクトリに置く。1 章 1 sidecar。

```json
{ "sourceDoc": "docs/delivery/design-document/02-reservation.md", "entries": [
  { "anchor": "1. 予約の受付", "from": "reservation-flow/REQ-114",
    "fingerprint": "sha256:3b1e...c9", "capturedBy": "agent:writer", "capturedAt": "2026-09-28",
    "acceptedBy": "reviewer@example.com", "acceptedAt": "2026-09-29", "normalizationVersion": 1 },
  { "anchor": "2. ご挨拶", "from": null, "reason": "挨拶文、由来を持たない",
    "blockFingerprint": "sha256:9f02...a1", "capturedBy": "agent:writer", "capturedAt": "2026-09-28",
    "acceptedBy": "reviewer@example.com", "acceptedAt": "2026-09-29", "normalizationVersion": 1 }
] }
```

**実装で変えた点**: `normalizationVersion` はファイル直下 1 個ではなく**エントリごと**に持つ (上記 JSON は実装に
合わせて直した)。`needs-recompute` は「このエントリを計算した版」対「今の版」の比較であり、ファイル単位 1 個だと
一部のエントリだけ再 capture したときに他のエントリの版情報が失われる。

- `from` あり: `fingerprint` は正本側 (行なら行頭セル定義そのもの、節なら見出し抽出のセクション本文) を正規化して SHA256 (§6)
- `from: null` (由来なし宣言): **`blockFingerprint`** (自分自身の現在のテキストの指紋) を持つ。書き直されたら §5 の `orphan-content` で違反にする
- `capturedBy` はどちらのエントリでも必須。`acceptedBy`/`acceptedAt` は accept 後に付く (無ければ §5 の `pending`)

**作る手順**: AI が章を書く → 節を書くたびに `provenance-capture` する → 別の主体 (人、または別のパック) が
`provenance-accept` する。正本が変わって §5 が「要確認」を出したら、**その節だけ**を書き直す (章全体を要約し
直さない)。要約という作業そのものは無くならない。減るのは「どこを直すべきかを探す」作業。

## 5. 鮮度の検査 (`provenance-check`)

| 状態 | 判定 | 扱い |
|---|---|---|
| `orphan` | sidecar の `anchor` が今の章に実在しない (節が消えた/名前が変わった) | 違反 |
| `source-missing` | `from` が今の正本で解決できない (`from` ありのときだけ。実装で追加 — 正本が消えた/移動したケースを `stale` と区別する) | 違反 |
| pending | `acceptedBy` が無い | 違反 |
| self-approved | `acceptedBy` = `capturedBy` | 違反 (作る主体と裁く主体を分ける) |
| `open-stated-as-final` | `from` の正本が未決なのに、章が確定を主張している (`from` ありのときだけ。§8 手順 3、判定は §9) | 違反 |
| needs-recompute | エントリの正規化版が今の版と違い、保存した版で計算した指紋は一致する。または保存した版の実装が無く確かめられない (§6) | 警告のみ (既定)。`--strict-normalization` で違反に上げる |
| stale | `from` の現在の指紋 (保存した版で計算) が保存値と違う | 違反 |
| `orphan-content` | `from: null` エントリの `blockFingerprint` が今のテキストと違う | 違反 (由来なし宣言の再確認) |
| ok | 上記以外 | 合格 |

**判定順 (実装で追加。設計に優先順位の明文が無かったため)**: 上の表の行の順に判定し、最初に当たった状態を
採る。`orphan` を最初に切るのは、章に無い節は指紋比較自体が成立しないため。`stale`/`orphan-content` は
保存した版 (`normalizationVersion`) で計算して比べるので、`needs-recompute` より先に判定する (版が古いだけで
`stale` にはならず、保存した版で一致して版が古いだけなら `needs-recompute`)。保存した版の実装が無いときは
確かめられないので `needs-recompute`。

## 6. 指紋の正規化

比較対象のテキストに、SHA256 の前に次を適用する。**整形だけの変更で落ちないこと**が目的。

1. 改行コードを `\n` に統一 (CRLF→LF)
2. 各行の行末の空白を除去
3. 連続する空白 (全角スペース含む) を単一の半角スペースに畳む。**コードフェンスの中は対象外**
4. 表の区切り線 (`|---|---|` 相当) はセル幅の整形にすぎないので固定文字列に正規化し、セル内容前後の空白は trim する。**コードフェンスの中は対象外**
5. 全角・半角の文字そのもの (かな漢字英数記号) は変換しない (意味が変わる可能性があるため。3 の空白だけを正規化する)
6. (v3) コードフェンスとインラインコードの外の Markdown リンク `[文字](行き先)` の行き先が相対パスなら、指す文書の frontmatter `id` に置き換える (`[文字](id:<id>#<アンカー>)`)。外部 URL・アンカーだけはそのまま。`id` の無い文書と docs/ の外の実在ファイルは repo 相対パス、存在しないパスはそのまま。文書を動かしてもリンク先が同じ文書なら指紋は変わらない ([ADR-0007](../adr/0007-fingerprint-link-normalization.md))

**実装で追加 (3・4)**: コードフェンスの中は字下げ・空白がそのまま意味を持つ内容 (コード例) なので、3・4 の
畳み込み・整形を適用しない (適用すると字下げの違う別内容が同じ指紋になってしまう)。フェンスの中も改行コード統一・行末空白除去 (1・2) は適用する。この修正で
`normalizationVersion` を 2 に上げた。

正規化ルールを変えたら `normalizationVersion` を上げる (今は 3)。版ごとの実装は残し、保存した指紋は**保存した版で**
計算し直して比べる。既存エントリは一斉に `stale` へは落とさず、保存した版で一致すれば `needs-recompute` (既定は警告のみ)
にする。`igeta fingerprint-rebase` は、保存した版で今の本文と一致したものだけを、同じ本文から今の版で計算し直して
載せ替える (承認は保つ。載せ替えたエントリには `rebasedFrom`・`rebasedAt`・`rebasedBy` が付く)。

## 7. CLI 一覧 (フラットな名前、由来の分)

| コマンド | 種別 | 終了コード |
|---|---|---|
| `provenance-capture <file> --anchor "<a>" (--from <id>/<token> \| --no-source --reason "<reason>") --by <name>` | 生成 | Ok / CannotCheck |
| `provenance-accept <file> (--anchor "<a>" \| --all) --by <name>` | 生成 | Ok / **Violation** (`self-approved` を拒んだとき、または一部が承認できなかったとき) / CannotCheck |
| `provenance-check [<file> ...] [--strict-normalization]` | 検査 (既定 OFF) | Ok / Violation / CannotCheck |
| `provenance-coverage [<file> ...]` | 検査 (既定 OFF、順方向) | Ok / Violation / CannotCheck |
| `source-coverage` | 検査 (既定 OFF、逆方向) | Ok / Violation / CannotCheck |

**実装で変えた点**: `--captured-by`/`--exempt` は `--by`/`--no-source --reason` にした (`provenance-accept`
の `--by` と揃え、「由来なし宣言」を `--no-source` で明示する)。合意台帳・`--record-agreement` の CLI は
[別紙](./08-agreement-ledger.md) に分けた。

## 8. 確定した前提・前提修正

- 決定 ID: 3 桁形式を標準のまま。`DEC-\d{3}` が日付入り ID (`DEC-YYYYMMDD-NN`) に部分一致する誤検出を前提修正として直す (適用手順は [別紙](./05-coverage-and-learning.md))
- **`open-stated-as-final` の判定 (05 §8 手順 3、実装で明記)**: 章の frontmatter `status` が
  `fixed`/`accepted` (確定を主張) **かつ**、`from` の解決先の `status` が `fixed`/`accepted` でない
  (**未設定も含む**) **または**解決先に `OPEN-nnn` の参照がある
  (正本が未決) の両方を満たしたときだけ違反にする

## 9. 限界

- `orphan-content`/`self-approved` は機械で防げるが、承認は「押した」ことしか記録しない。値の正しさそのものは見抜けない
- `needs-recompute` を既定で警告のみにしたのは正規化変更時の一斉違反を避けるためだが、放置すれば陳腐化した指紋が残り続ける (運用で `--strict-normalization` へ切り替える判断が要る)
- self-approved の比較は前後の空白除去・大文字小文字統一・Unicode NFKC 正規化までは行うが、**別名 (同じ主体が
  違う名乗りをする、例: `reviewer@example.com` と `reviewer` を同じ人が使う) は機械で見抜けない**
