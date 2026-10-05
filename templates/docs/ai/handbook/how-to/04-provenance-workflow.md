---
id: provenance-workflow
title: 由来 (provenance) の付け方 — 章を書く手順
type: guide
kind: provenance-workflow
status: active
canonical: true
owners: [product, eng]
created: 2026-09-30
depends_on: [document-taxonomy]
relates_to: []
---

# 由来 (provenance) の付け方 — 章を書く手順

> **When to use**: `kind: delivery-chapter` (先方提出用の章) を書く・直すとき。由来・鮮度の仕組み全体は
> [由来・鮮度・合意台帳の形](https://github.com/SakakitaniJunya/Igeta/blob/main/docs/explanation/04-provenance-and-agreement.md) にある。

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [文書体系](./01-document-taxonomy.md) | — |
| 下流 | `igeta provenance-capture` / `igeta provenance-accept` / `igeta provenance-check` | — |

## 1. 手順

1. **章を書く** — `templates/docs/client/delivery/__deliverable__/__chapter__.md` から起こす。要約という作業そのものは
   いつも通り必要 (由来はその後ろに付けるだけで、要約作業を無くすものではない)。
2. **節ごとに `provenance-capture` する** — H2 節 1 つに由来 1 件。正本の記述を要約したなら
   `--from <doc-id>/PREFIX-nnn` (または `<doc-id>#<見出し>`)、要約ではない節 (挨拶・まとめ等) は
   `--no-source --reason "<理由>"`。

   ```bash
   igeta provenance-capture docs/client/delivery/design-document/02-reservation.md \
     --anchor "1. 予約の受付" --from reservation-flow/REQ-114 --by agent:writer
   ```

3. **別の主体が `provenance-accept` する** — 章を書いた主体 (`capturedBy`) と同じ主体では
   accept できない (`self-approved` は違反)。人、または別の pack が読んで判断する。

   ```bash
   igeta provenance-accept docs/client/delivery/design-document/02-reservation.md --all --by reviewer@example.com
   ```

4. **正本が変わったら `provenance-check` で気づく** — `stale`/`orphan`/`orphan-content` が出た節**だけ**
   書き直し、再度 capture → accept する。章全体を読み直さない (どこを直すかを探す作業を減らすのが目的)。

## 2. 由来を付け終えたら

- `igeta provenance-coverage <章>` — 全塊に由来があるか (無い塊は忘れている)
- `igeta source-coverage` — 正本の行のうち、どの章の由来にも現れないものが無いか
- どちらも既定 OFF。CI に足すかは案件で決める
