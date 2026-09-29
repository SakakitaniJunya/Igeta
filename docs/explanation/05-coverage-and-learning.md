---
id: coverage-and-learning
title: 由来の網羅検査と、食い違いを規則へ育てる学習ループ (delivery-chapter 限定)
type: explanation
kind: explanation
status: active
canonical: true
owners: [product, eng]
created: 2026-09-30
depends_on: [provenance-and-agreement]
relates_to: [audience-layers]
---

# 由来の網羅検査と、食い違いを規則へ育てる学習ループ (delivery-chapter 限定)

> **TL;DR**: [由来・鮮度](./04-provenance-and-agreement.md) は「由来が古いか」だけを見る。ここでは
> **順方向** (delivery-chapter の塊に由来が無い) と**逆方向** (正本が誰の由来にもなっていない) の
> 網羅を検査し、評価で見つかった食い違いを**案件の repo に追記のみで記録**して、汎化した規則だけを
> Igeta 本体へ昇格させる (参入障壁の本体)。適用手順・moat の見立ても本紙に置く。

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [由来・鮮度・合意台帳](./04-provenance-and-agreement.md) | — |
| 下流 | `.igeta.json` の `coverageExemptions` | — |

## 1. 順方向の網羅 (`provenance-coverage`)

`delivery-chapter` を H2 節単位の塊に分解 (「関連」節は除く)。全塊が sidecar にエントリ (`from` 有り、または
`from: null` + `reason`) を持つことを検査する。既定 OFF。終了コードは Ok / Violation / CannotCheck。

## 2. 逆方向の網羅 (`source-coverage`)

正本の要件行のうち、**どの `delivery-chapter` の sidecar の `from` にも現れないもの**を一覧する。

- 文書単位の対象外: 正本側 frontmatter に `clientExempt: true`
- 行単位の対象外: `.igeta.json` の `coverageExemptions` (理由必須)

  ```json
  { "coverageExemptions": [ { "id": "reservation-flow/REQ-999", "reason": "内部専用 API、顧客要件外" } ] }
  ```

既定 OFF。終了コードは Ok / Violation (対象外宣言の無い未参照行が 1 件以上) / CannotCheck。

## 3. 食い違いの記録 (案件の repo)

`docs/delivery/<提出物名>/discrepancies.log.jsonl` (追記のみ、JSON Lines)。**案件の情報は案件の repo にだけ置く**。

```json
{"date":"2026-09-30","location":"docs/delivery/design-document/02-reservation.md#1.予約の受付","sourceId":"reservation-flow/REQ-114","category":"scope-overstatement","caughtBy":null,"fixedInCommit":"a1b2c3d"}
```

`caughtBy` は事前に捕まえた検査名 (`provenance-check` 等)。評価者 (人) が後から見つけた場合は `null`。
記録は評価ラウンド・検査違反・発注側からの指摘のたびに 1 行追記する。**節単位が既定粒度**(§ [別紙](./04-provenance-and-agreement.md)
§3) なので件数は章の節数に比例し、台帳・sidecar は提出の回数に比例して増える (章のサイズには比例しない)。

## 4. 種類の初期一覧 (実例から)

| category | 何か |
|---|---|
| `scope-overstatement` | 範囲の言い過ぎ |
| `open-stated-as-final` | 未決を確定と書いた |
| `missing-confirmation-item` | 確認事項の欠落 |
| `stale-copy-across-sources` | 正本同士の古い記述を写した |
| `mermaid-unrenderable` | 図が描けない (構文誤り) |

## 5. 集計 — `discrepancy-report`

種類ごとの件数と「検査が事前に捕まえた割合」(`caughtBy` が非 null の割合) を出す。[別紙](./04-provenance-and-agreement.md)
の仕組みを**やめる条件**はこの数字で測る (例: `scope-overstatement`/`open-stated-as-final` の事前捕捉率が
25% (4 件中 1 件) 以下なら由来+指紋をやめる、`mermaid-unrenderable` が 0% (2 件中 0 件) なら早期検査をやめる)。
既定 OFF、手動実行 (CI 常時実行はしない)。

## 6. 規則へ昇格させる手順

1. 同一 `category` が同一案件で 3 件以上、または 2 案件以上にまたがって計 5 件以上貯まったら実装候補にする
2. 候補は `category` と捕まえ方の型だけを取り出し、**案件名・具体的な文言・実際の数値は持ち込まない**
3. 実装後は §5 の集計で事前捕捉率が上がったかを次の案件群で確認する。上がらなければ実装を見直す

## 7. 参入障壁の見立て

| 写せる | 写せない (moat の候補) |
|---|---|
| sidecar・指紋の仕組み (Doorstop の親指紋と同型) | 案件ごとに溜まった「食い違いの規則」の実測ログ |
| 検査コードそのもの (MIT 公開) | 合意台帳の再合意判定規則・**delivery-chapter だけに絞る境界判断**そのもの (運用で磨くしかない) |

**都合の悪い見立て**: Doorstop/Sphinx-Needs 等の組み合わせで骨格は再現できる可能性が高い。moat は要素技術には無い。

## 8. 段階導入の順・実装ファイルの境界

1. 決定 ID 正規表現の誤検出を直す (前提修正)
2. まとまりの kind (`context-map`/`context-contract`) を `ARC42_BY_KIND` (null) と `NON_ARC42_KINDS` に登録する。未登録の kind は `template-check` が既定で違反にするため、テンプレの追加と同時に行う ([まとまりの境界](./07-context-boundaries.md))
3. 由来 sidecar (`provenance-capture`/`provenance-accept`) + `provenance-check` (§4 `open-stated-as-final` を実装。`from` の正本 status が未決なのに派生物が確定を主張している場合を落とす)
4. Mermaid 早期検査 (§4 `mermaid-unrenderable` を評価より前に倒す。export の描画チェックを共有モジュールに切り出す)
5. 順方向・逆方向の網羅 (`provenance-coverage`/`source-coverage`)
6. 合意台帳 (`export --record-agreement`/`agreement-approve`/`agreement-check`。export (PR #11) が main と揃ってから着手)

新設検査・コマンドは全部新規ファイルに置き、既存ファイルの変更は `cli.ts` の登録行と、手順 2 の kind 登録 2 か所だけ
(delivery-chapter は既存 kind のため登録は不要)。試験中の他 PR とぶつかるのはその数行だけなので、他 PR の確定を待たずに着手できる。

## 9. 実案件への適用手順 (案件名は出さない)

1. Igeta 側: PR #11 (export) と最新の人間レビュー層を含む新タグを切る
2. 案件側: npm git 依存に切り替え、決定 ID を 3 桁形式へ採番し直す (日付入り ID は「原文」列に残す)
3. 由来 sidecar を新規に書く章からだけ作り始め、`provenance-check`/`provenance-coverage` を warning 運用の期間を置いてから block に切り替える
4. 合意台帳は次回の提出物から開始する (過去分を遡って記録しない)

## 10. 限界

- `clientExempt`/`coverageExemptions` の理由は自由記述で、機械は妥当性を判定しない
- §6 の昇格閾値は実測ゼロの状態での見立てにすぎない
