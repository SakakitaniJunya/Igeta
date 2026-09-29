---
id: <kebab-slug>
title: <章のタイトル>
type: delivery-chapter
kind: delivery-chapter
status: draft
canonical: true
owners: [pm, eng]
created: YYYY-MM-DD
depends_on: []
relates_to: []
---

<!--
  igeta export が PDF 1 冊に束ねる「先方提出用設計書」の章 1 本分。
  deliverable.json の chapters に列挙した順で束ねられる。frontmatter と
  <!-- AUTOGEN --> 区間は export 時に自動で除去されるので、社内向けの
  メタ情報はここに書いてよい。本文 (# 見出し以降) がそのまま PDF になる。
  社内 ID (DEC-/REQ- など) を本文に残すと deliverable.json の forbid が検出して
  export を止める。
-->

# <章のタイトル>

> **TL;DR**: <この章で先方に伝える結論を 1 文で>

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | <この章の元になった社内設計書> | — |
| 下流 | <deliverable.json (このファイルを束ねる manifest)> | — |

<!-- ここから先方に見せる本文。```mermaid フェンスは export 時に図として描画される -->
