---
id: coverage-and-learning
title: 由来の網羅検査と、食い違いを規則へ育てる学習ループ
type: explanation
kind: explanation
status: active
canonical: true
owners: [product, eng]
created: 2026-09-30
depends_on: [provenance-and-agreement]
relates_to: [audience-layers]
---

# 由来の網羅検査と、食い違いを規則へ育てる学習ループ

> **TL;DR**: [由来・鮮度](./04-provenance-and-agreement.md) は「ある由来が古いか」しか見ていなかった。
> ここでは**順方向** (派生物の塊に由来が無い) と**逆方向** (正本が誰の由来にもなっていない) の
> 網羅を検査で見る。加えて、評価で見つかった食い違いを**案件の repo に追記のみで記録**し、
> 件数が育ったら**汎化した規則だけ** Igeta 本体に昇格させる、参入障壁の本体となる流れを定める。

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [由来・鮮度・合意台帳](./04-provenance-and-agreement.md) | — |
| 下流 | `.igeta.json` の `coverageExemptions` | — |

## 1. 順方向の網羅 (派生物 → 由来)

`client-chapter`/`feature-brief` を**塊** (H2 節、節内に表があれば表の行単位) に分解し、全塊が sidecar に
エントリを持つことを検査する。「関連」節は対象外 (由来を持つ対象ではない)。

- 塊のアンカーは既存の由来アンカーと同じ形式: `<H2 見出し>` (表が無い節) / `<H2 見出し> > table:<n> > <先頭セル>` (表の行)
- 由来が要らない塊 (挨拶・読み方の説明等) は sidecar に `{ "anchor": "...", "from": null, "reason": "挨拶文、由来を持たない", "capturedBy": "...", "acceptedBy": "..." }` を明示する。`from: null` でも `capturedBy`/`acceptedBy` は必須 (自己承認は §2 の `self-approved` と同じ規約で禁止。理由なしの exempt 濫用を防ぐ)
- 検査: 新設 `CoverageForwardCheck` → CLI `provenance-coverage`。塊はあるのに sidecar エントリが無い (`from` も `reason` も無い) を違反にする

## 2. 逆方向の網羅 (正本 → 派生物)

正本の `requirements`/`function-list` 等が定義する行 (`collectRowDefinedTokens`) のうち、**どの `client-chapter` の
`from` にも、どの `feature-brief` の関わる REQ ID にも現れないもの**を一覧する。

- 対象外の宣言は 2 通り: ①文書単位 — 正本側の frontmatter に `clientExempt: true` (例: 内部専用の運用要件書を丸ごと除く)
  ②行単位 — `.igeta.json` の `coverageExemptions` に理由つきで列挙する

  ```json
  { "coverageExemptions": [ { "id": "reservation-flow/REQ-999", "reason": "内部専用 API、顧客要件外" } ] }
  ```

- 検査: 新設 `CoverageBackwardCheck` → CLI `source-coverage`。対象外宣言の無い未参照行を一覧して違反にする (0 件なら合格)

両検査とも `provenance-check` と同じ「別コマンド・既定で CI に無い」型で opt-in。終了コードは Ok / Violation / CannotCheck。

## 3. 食い違いの記録 (案件の repo)

`docs/client/discrepancies.log.jsonl` (追記のみ、JSON Lines)。**案件の情報は案件の repo にだけ置く** (Igeta 本体に持ち込まない)。

```json
{"date":"2026-09-30","location":"docs/client/02-reservation.md#1.予約の受付>table:1>予約の変更","sourceId":"reservation-flow/REQ-114","category":"scope-overstatement","caughtBy":null,"fixedInCommit":"a1b2c3d"}
```

- `caughtBy`: 事前に捕まえた検査名 (`provenance-check`/`mermaid-check` 等)。評価者 (人) が後から見つけた場合は `null`
- 記録は**評価で食い違いが見つかるたび** (評価ラウンド・`provenance-check`/`source-coverage` の違反・顧客からの指摘) に 1 行追記する

## 4. 種類の初期一覧 (実例から)

| category | 何か |
|---|---|
| `scope-overstatement` | 範囲の言い過ぎ (対象外のことを対象内のように書いた) |
| `open-stated-as-final` | 未決を確定と書いた |
| `missing-confirmation-item` | 確認事項の欠落 |
| `stale-copy-across-sources` | 正本同士の古い記述を写した (正本 A を直したが、正本 B からの由来がそれを追随しなかった) |
| `mermaid-unrenderable` | 図が描けない (構文誤り) |

## 5. 集計 — `igeta discrepancy-report`

`discrepancies.log.jsonl` を読み、種類ごとの件数と「検査が事前に捕まえた割合」(`caughtBy` が非 null の割合) を出す。
[別紙 1](./04-provenance-and-agreement.md) §7 の「やめる条件」はこの数字で測る (例: `scope-overstatement`/`open-stated-as-final` の
事前捕捉率が 25% (4 件中 1 件) 以下なら由来+指紋をやめる、`mermaid-unrenderable` の事前捕捉率が 0% (2 件中 0 件) なら早期検査をやめる、
という判定をコマンドの出力する数値で行う)。既定 OFF (手動実行。CI には組み込まない — 集計はレビューの節目で見るもので、常時実行する検査ではない)。

## 6. 規則へ昇格させる手順

1. 同一 `category` が**同一案件で 3 件以上、または 2 案件以上にまたがって計 5 件以上**貯まったら、汎化した検査の実装候補にする
2. 候補は `category` と、捕まえ方の型 (由来の指紋比較 / 網羅検査 / status 突き合わせ / Mermaid 構文) だけを取り出し、**案件名・具体的な文言・実際の数値は持ち込まない**。Igeta 本体に入るのは汎化した検査ロジックだけ
3. 実装後は §5 の集計で「その category の事前捕捉率」が上がったかを次の案件群で確認する。上がらなければ実装を見直す (規則自体をやめる条件ではなく、実装の見直し対象にする)

## 7. CLI 一覧

| コマンド | 種別 | 終了コード |
|---|---|---|
| `provenance-coverage` | 検査 (新設・既定 OFF) | Ok / Violation / CannotCheck |
| `source-coverage` | 検査 (新設・既定 OFF) | Ok / Violation / CannotCheck |
| `discrepancy-report` | 集計 (新設・既定 OFF、CI 組み込み対象外) | Ok / CannotCheck (ログが無い/壊れている) |

## 8. 限界

- `clientExempt`/`coverageExemptions` の理由は自由記述で、機械は「妥当な理由か」を判定しない。濫用 (何でも exempt にして逆方向網羅を骨抜きにする) は防げない。`source-coverage` の出力件数の推移を人が定期的に見る運用が前提
- 昇格の閾値 (§6-1) は実測ゼロの状態での見立てにすぎない。最初の案件群を通した後に閾値そのものを見直す
