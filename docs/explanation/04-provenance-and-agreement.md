---
id: provenance-and-agreement
title: 由来・鮮度・顧客との合意台帳の形 (delivery-chapter 限定)
type: explanation
kind: explanation
status: active
canonical: true
owners: [product, eng]
created: 2026-09-30
depends_on: [audience-layers]
relates_to: [coverage-and-learning]
---

# 由来・鮮度・顧客との合意台帳の形 (delivery-chapter 限定)

> **TL;DR**: 由来・鮮度・合意台帳は既存 kind **`delivery-chapter`** (提出物の章、PR #11) **だけ**に課す。
> 由来は本文に書かず **sidecar** (`<章>.provenance.json`) に置き、既定粒度は **H2 節** (表の行は任意)。
> 鮮度は保存した状態を信用せず都度 SHA256 で再計算し、`self-approved`/`orphan` も違反にする。
> 合意は `docs/delivery/<提出物名>/agreements.ledger.jsonl` (追記のみ)。

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [読み手別の入口](./03-audience-layers.md) | — |
| 下流 | [網羅・学習](./05-coverage-and-learning.md) / `templates/docs/delivery/__chapter__.md` | — |

## 1. 由来 (provenance) の形 — 本文の外のどちらにするか

| 案 | 検討 |
|---|---|
| 本文内 `## 由来` 節 / 行コメント | 節単位にしかならず export の `omitSections` 変更が要る。行コメントは `AUTOGEN` 以外の HTML コメントが PDF に文字で出る既知不具合があり、`AUTOGEN` も行単位の範囲除去でしか効かない |
| **sidecar ファイル (採用)** | export の `manifest.chapters` に載らないので `forbid`/`omitSections`/`html:false` に一切触らずゼロ変更で済む |

## 2. kind と置き場所

`client-chapter` は新設せず、既存 `delivery-chapter` (`templates/docs/delivery/__chapter__.md`、PR #11) に統一する。
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
{ "sourceDoc": "docs/delivery/design-document/02-reservation.md", "normalizationVersion": 1, "entries": [
  { "anchor": "1. 予約の受付", "from": "reservation-flow/REQ-114",
    "fingerprint": "sha256:3b1e...c9", "capturedBy": "agent:writer", "capturedAt": "2026-09-28",
    "acceptedBy": "reviewer@example.com", "acceptedAt": "2026-09-29" },
  { "anchor": "2. ご挨拶", "from": null, "reason": "挨拶文、由来を持たない",
    "blockFingerprint": "sha256:9f02...a1", "capturedBy": "agent:writer", "capturedAt": "2026-09-28",
    "acceptedBy": "reviewer@example.com", "acceptedAt": "2026-09-29" }
] }
```

- `from` あり: `fingerprint` は正本側 (行なら `collectRowDefinedTokens` の定義行、節なら見出し抽出のセクション本文) を正規化して SHA256 (§6)
- `from: null` (由来なし宣言): **`blockFingerprint`** (自分自身の現在のテキストの指紋) を持つ。書き直されたら §5 の `orphan-content` で「要確認」にする
- `capturedBy`/`acceptedBy` はどちらのエントリでも必須 (由来なし宣言も承認対象。理由なしの exempt 濫用を防ぐ)

**作る手順**: AI が章を書く → 節を書くたびに `provenance-capture` する → 別の主体 (人、または別のパック) が
`provenance-accept` する。正本が変わって §5 が「要確認」を出したら、**その節だけ**を書き直す (章全体を要約し
直さない)。要約という作業そのものは無くならない。減るのは「どこを直すべきかを探す」作業。

## 5. 鮮度の検査 (`provenance-check`)

| 状態 | 判定 | 扱い |
|---|---|---|
| pending | `acceptedBy` が無い | 違反 |
| stale | `from` の現在の指紋が保存値と違う | 違反 |
| `orphan` | sidecar の `anchor` が今の章に実在しない (節が消えた/名前が変わった) | 違反 |
| `orphan-content` | `from: null` エントリの `blockFingerprint` が今のテキストと違う | 違反 (由来なし宣言の再確認) |
| self-approved | `acceptedBy` = `capturedBy` | 違反 (作る主体と裁く主体を分ける) |
| needs-recompute | エントリの正規化版が今の版と違う (§6) | 警告のみ (既定)。`--strict-normalization` で違反に上げる |
| ok | 上記以外 | 合格 |

## 6. 指紋の正規化

比較対象のテキストに、SHA256 の前に次を適用する。**整形だけの変更で落ちないこと**が目的。

1. 改行コードを `\n` に統一 (CRLF→LF)
2. 各行の行末の空白を除去
3. 連続する空白 (全角スペース含む) を単一の半角スペースに畳む
4. 表の区切り線 (`|---|---|` 相当) はセル幅の整形にすぎないので固定文字列に正規化し、セル内容前後の空白は trim する
5. 全角・半角の文字そのもの (かな漢字英数記号) は変換しない (意味が変わる可能性があるため。3 の空白だけを正規化する)

正規化ルールを変えたら `normalizationVersion` を上げる。既存エントリは一斉に `stale` へは落とさず、
`needs-recompute` (既定は警告のみ) にして段階的に `provenance-capture` を再実行させる。

## 7. 顧客との合意台帳

`docs/delivery/<提出物名>/agreements.ledger.jsonl` (追記のみ、JSON Lines)。

```jsonl
{"event":"export","version":"1.2.0","date":"2026-09-30","chapters":[{"file":"02-reservation.md","sources":[{"from":"reservation-flow/REQ-114","fingerprint":"sha256:3b1e...c9"}]}]}
{"event":"approve","targetVersion":"1.2.0","approvedBy":"発注側の責任者","approvedAt":"2026-10-02"}
```

`export` は既存 `ExportCommand` に `--record-agreement` を足して成功時に追記。`agreement-approve` は人が押す。
`agreement-check` は最新の approve が指す版の `sources` を今の正本で再計算し、`.igeta.json` の `reagreementRules`
(kind + 節単位まで) に当たる変更を「再合意が要る」として一覧する。

## 8. CLI 一覧 (フラットな名前)

| コマンド | 種別 | 終了コード |
|---|---|---|
| `provenance-capture <file> --anchor "<a>" [--from <id>/<token> \| --exempt "<reason>"] --captured-by <name>` | 生成 | Ok / CannotCheck |
| `provenance-accept <file> [--anchor "<a>" \| --all] --by <name>` | 生成 | Ok / **Violation** (`self-approved` を拒んだとき) / CannotCheck |
| `provenance-check` | 検査 (既定 OFF) | Ok / Violation / CannotCheck |
| `agreement-approve <version> --by <name>` | 生成 | Ok / CannotCheck |
| `agreement-check` | 検査 (既定 OFF) | Ok / Violation / CannotCheck |
| `export --record-agreement` | 既存 flag 追加 (PR #11 merge 後) | 既存 `export` の終了コードに従う |

## 9. 確定した前提・前提修正

- 決定 ID: 3 桁形式を標準のまま。`DEC-\d{3}` が日付入り ID (`DEC-YYYYMMDD-NN`) に部分一致する誤検出を前提修正として直す (適用手順は [別紙](./05-coverage-and-learning.md))
- 再合意の判定粒度: kind + 節単位まで (列単位は持たない)

## 10. 限界

- `orphan-content`/`self-approved` は機械で防げるが、承認は「押した」ことしか記録しない。値の正しさそのものは見抜けない
- `needs-recompute` を既定で警告のみにしたのは正規化変更時の一斉違反を避けるためだが、放置すれば陳腐化した指紋が残り続ける (運用で `--strict-normalization` へ切り替える判断が要る)
