---
id: context-boundaries
title: まとまり (業務コンテキスト) の境界で読み込む量を短くする理由
type: explanation
kind: explanation
status: active
canonical: true
owners: [product, eng]
created: 2026-09-30
depends_on: [audience-layers]
relates_to: []
---

# まとまり (業務コンテキスト) の境界で読み込む量を短くする理由

> **TL;DR**: 設計書を**業務のまとまり (context)** ごとに分け、人も AI も**1 つのまとまりだけ読めば
> 作業できる**ようにする。由来 ([別紙](./04-provenance-and-agreement.md)) が「正本と派生物の対応」を
> 扱うのに対し、こちらは「1 回に読む量」を扱う直交する軸。
> - frontmatter `context: <名前>` (無記入 = `shared`、既存案件を赤くしない)
> - 新設 kind 2 つ (`context-map`/`context-contract`) は**固定ディレクトリ + ファイル名ワイルドカード**
>   という既存の kind 解決の型に合わせる。可変ディレクトリ (`docs/<context>/`) は使わない

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [読み手別の入口](./03-audience-layers.md) | — |
| 下流 | `templates/docs/contexts/maps/__context__.md` / `templates/docs/contexts/contracts/__context__.md` | — |

## 1. frontmatter `context`

全 kind に横から足す任意フィールド。値は kebab-case の自由文字列 (例: `reservation`)。**無記入は `shared`**
(共有。既存文書は無記入のままで境界検査に引っかからない)。`delivery-chapter` には**適用しない** (由来層は
[別紙](./04-provenance-and-agreement.md) で別途管理しており、複数 context をまとめて要約するのが前提のため)。

## 2. まとまりの地図 (`context-map`)

kind の解決は既存の決まり (ディレクトリの完全一致 + ファイル名のワイルドカード) に合わせる。**工程別の
既存フォルダ構成は変えない** — まとまりはフォルダではなく `context` フィールドで表す。

| 論点 | 決定 |
|---|---|
| テンプレ置き場 | `templates/docs/contexts/maps/__context__.md` |
| 実ファイル置き場 | `docs/contexts/maps/<context-slug>.md` (スロット `contexts/maps` に固定。`<context-slug>` はファイル名で表す) |
| `line_limit` | 150 |
| `depends_on` 既定値 | `[map]` (全体地図) |
| 内容 | このまとまりの概要、含む機能 (REQ 範囲・関わる `feature-brief` へのリンク)、隣接まとまりへの入口 (§3 の約束の 1 枚) |

**地図の網羅 (2 段、`template-check --require-human-review` に相乗り)**: (a) 全体の地図が存在する全部の
まとまりの地図をリンクしているか (b) まとまりの地図が自分のまとまりの `feature-brief` 全部をリンクしているか
を見る。既存の「地図が `requirements` を全部リンクしているか」と同じ型。まとまりの地図が 1 枚も無い案件では
何も起きない (既存案件を赤くしない)。

## 3. まとまり同士の約束 (`context-contract`)

他のまとまりに見せてよいもの (API・イベント・持っているデータ・用語) だけを書く 1 枚。150 行以内。

| 論点 | 決定 |
|---|---|
| テンプレ置き場 | `templates/docs/contexts/contracts/__context__.md` |
| 実ファイル置き場 | `docs/contexts/contracts/<context-slug>.md` |
| `depends_on` 既定値 | `[<自分の context-map の id>]` |
| 書かないもの | 内部実装・内部だけで使う REQ・未確定の値の詳細 |

## 4. 境界の検査 (`context-boundary-check`、既定 OFF)

`context: A` の文書が `context: B` の文書を `depends_on`・本文リンク・修飾 ID で**直接**参照していたら違反にする。
通すのは次の 3 種だけ:

1. B の `context-contract` (1 枚。どの context の contract かは問わない — 契約は「外部に見せてよいもの」として
   書かれている前提のため)
2. 共有文書 (既定の allowlist: `glossary` / `adr` / `map` / `decision-log` / `document-taxonomy` / `explanation` /
   `guide` / `runbook`。`.igeta.json` の `sharedKinds` で上書き可)
3. **参照元 (A) 自身が `shared` のとき** (実装で追加。§1 の「無記入 = shared」から導かれる — 全体の地図
   (`kind: map`、`context` 無記入) が §2 の地図網羅検査で各まとまりの地図へリンクするのを、この検査が
   矛盾して落とさないようにするため)

## 5. 量の上限 (`context-size <context>`)

指定した context の**自分の文書 + 参照している隣の `context-contract`** の総行数を出す。`.igeta.json` の
`contextSizeLimit` (既定値は未設定 = 警告しない。実測が無いうちに数値を決め打ちしない) を超えたら
「まとまりを分ける合図」として知らせる。既定 OFF、終了コードは Violation (超過時) / Ok / CannotCheck
(指定した context が存在しない。実装で `context-files` §6 と揃えた)。省略時は全部のまとまりを一覧する。

## 6. AI が読む一覧 (`context-files <context>`)

指定した context の**自分の文書 + 参照している `context-contract` + 共有文書**の一覧をパスで出す。
AI が作業の最初に呼ぶ想定 (何を読むべきかを毎回自分で数え上げさせない)。終了コードは Ok / CannotCheck
(context が存在しない)。

**実装で足した絞り込み (設計に無い)**: 共有文書は allowlist 全部を出すと短縮にならない (§7 の狙いに反する)。
既定では共有のうち `context: shared` の文書に限り、かつ kind が `map` / `glossary` のものだけを出す
(自分のまとまりの地図は「自分の文書」に既に含まれる)。`--with-shared` で共有文書を全部出す。

## 7. 規模の試算 (まとまり単位)

| 読み手 | 機能 35 件 | 機能 300 件 | 増える単位 |
|---|---|---|---|
| agent (正本) | 77 本・約 8,400 行 (全量) | 概算 660 本・約 72,000 行 (全量) | 総量は比例。1 タスクは `context-files` で絞った範囲だけを読む |
| developer/発注側 | 全体地図 150 行 + まとまりの地図 150 行 + 変更対象の `review-sheet` 展開 | 変わらず同じ | 増えるのは「まとまりの数」(6〜7→?) だけ。1 回に読む量は不変 |

**未検証の仮説**: 「まとまりの数は機能の数より緩やかに増える」(機能 300 件でもまとまりが数十程度に収まる) は
実測が無い。最初の適用案件でまとまりの数と機能数の比を測り、比が保たれなければこの章の前提を見直す。

## 8. 段階導入・既定の強さ

| 論点 | 決定 | 理由 |
|---|---|---|
| `context` の読み取り | 常時 (無記入は `shared`) | 値を読むだけなら既存文書に影響しない |
| 境界検査・量の上限 | 別コマンド、既定 CI に無い | 既存プロジェクトを一斉に赤くしない |
| `contextSizeLimit` の既定値 | 設定しない (無制限) | 実測ゼロで数値を決め打ちしない (§7 と同じ理由) |

## 9. 限界と残った論点

- allowlist (`sharedKinds`) の初期値は実例からの起点ではなく既存 kind 一覧からの類推。運用で見直しが要る
- `context-contract` の「見せてよいもの」の妥当性は機械では判定しない (書いた人の自己申告)
- まとまりの分割・統合 (境界を引き直す) の手順は今回書いていない。§7 の実測ができてから設計する
