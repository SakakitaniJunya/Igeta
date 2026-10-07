---
id: adr-0011-person-diagram-first
title: ADR-0011 人の文書は冒頭に kind ごとの図を置く — 図種は要件の表で決め、PersonFormCheck が図種と位置を見る
type: adr
kind: adr
arc42: 9
status: proposed
canonical: true
owners: [eng]
created: 2026-10-08
depends_on: [adr-0002-role-boundary-invariants, adr-0009-kind-placement, adr-0010-value-ownership]
relates_to: [test-person-form, test-person-diagram]
---

# ADR-0011: 人の文書は冒頭に kind ごとの図を置く — 図種は要件の表で決め、PersonFormCheck が図種と位置を見る

> **TL;DR**: 人が全部読んで承認する文書のうち 16 の kind は、TL;DR の次の節 (最初の表より前) に、kind ごとに決めた
> 図種の Mermaid の図を 1 枚以上持つ。図が要る kind を 6 から 16 に広げ、図種と位置も検査で見る (ADR-0002 条件 6 の改め)。
> 図が要らないのは adr と feature-brief の 2 つ。表は消さず、図が俯瞰を、表が決める行を受け持つ

## 関連

- **上流 (depends_on)**: ADR-0002 (条件 6) / ADR-0009 (型の検査の区分) / ADR-0010 (値の持ち主は 1 つ)
- **下流**: [要件定義書 02](../product/02-audience-directories.md) §8 / [テスト仕様 08](../design/test/specs/08-person-diagram.md) /
  `src/core/Role.ts`・`src/checks/{PersonFormCheck,MermaidCheck}.ts` / `templates/docs/person/**` の 16 本 /
  図の記述の 2 文書 (文書体系ガイド §4・[解説 09](../explanation/09-reader-granularity.md) §3。`TaxonomyGuideSync.test.ts` が §8 と突き合わせる)

## Status

2026-10-08 提案。CEO 指摘 (原文): 「Igeta をまず修正しろって、そこにちゃんとした雛形をかっちり作ってください。
人間のものは視覚的に」。ADR-0002 の条件 6 をこの ADR で改める。

## Context

v0.5.0 の person の雛形 19 本のうち、図があるのは 6 本。残りの 13 本 (うち 1 本は生成索引) は表だけで、人が承認する文書が
表の羅列になっている。ADR-0002 条件 6 は図が要る kind を 6 つに固定し、図種を問わず「1 枚以上」としか見ない。空の図でも通る。

## Decision Drivers

- 先に全体が見え、表は決める行を読むために使う。図は CEO が手で直せる Mermaid だけ。水増しの図は作らせない
- 検査の無い条件は採らない (ADR-0002)。値の持ち主は 1 つ (ADR-0010)

## Decision

**1. 図が要る kind を 16 にする**。要件 02 §8 の表に kind ごとの許す図種を置く。Role.ts と雛形はその転記 (同期はテストが見る)。

**2. 図が要らない kind は 2 つ**: adr (1 本 = 1 つの決定。判断軸の表と却下の列で足りる。強制すると中身の無い図が増える。
全体の俯瞰は決定台帳の図が受け持つ) / feature-brief (2〜3 文とストーリーの表。図はまとまりの地図と業務フローが持つ)。

**3. 検査は図種と位置を見る**: 許す図種の数える図 (閉じていて、図種が読めて、中身がある) が 1 枚以上あり、最初の 1 枚が
冒頭域 (最初の表と 2 つ目の `##` の手前) にある。規則は [テスト仕様 08](../design/test/specs/08-person-diagram.md)。
図 1 枚が 40 行を超えたときだけ警告で、他は違反。

**4. 図に書くのは名前・ID・関係**。値は行が持つ (ADR-0010)。図に値を書く例外は 2 つ: gantt・timeline の日付 (行の期間と同じ値)、
quadrantChart の点の位置。点は行の 高・中・低 を 0.85・0.5・0.15 に写す (risks は確率・影響、nonfunctional は厳しさ・費用への効きの列)。
図だけが持つ値は無い。写しが行とずれていないかは承認のときに人が見る。図の粒度は、まとまり・段階・文書の単位。行の ID の列挙は表に任せる。

**5. ai と役割を分ける (ADR-0010)**: person の図は範囲・関係・置き場所・順序の俯瞰。ER・部品間のシーケンスは ai の
domain-model・table-spec・sequence-spec が持つので、data-management に erDiagram を、solution-strategy に sequenceDiagram を
許さない。business-flow の sequenceDiagram (人と人の受け渡し)、screen-spec の stateDiagram (画面の表示の状態) は、
人が見る単位なので許す。

**6. 図の取り出しは 1 か所**: `core` に図を取り出す関数を 1 つ置き、PersonFormCheck と MermaidCheck が使う。いまは
PersonFormCheck が `~~~mermaid` を数え、MermaidCheck は ` ``` ` だけを描画確認するので、`~~~` の図は描画の誤りが素通りする。

**7. 始め方**: 警告の期間を置かず、最初から違反。利用 repo は `.igeta-version` で版を固定しているので、版を上げる PR で
図を足す。描画の可否は検査に入れず (`mermaid-check` は既定 OFF)、雛形の図は Igeta 自身のテストで描画を確かめる。

**8. 雛形にレイアウトの指定を書かない**: 同梱の mermaid に ELK (`@mermaid-js/layout-elk`) は無い (package-lock で実測)。
指定しても dagre に落ちる恐れがある (挙動は未検証)。向きは `TB` を書く。ELK を入れるかは別の決定にする。

## 却下した選択肢

- **全 kind に図を必須にする (adr・feature-brief も)**: 決定 1 件の図は選択肢の言い換えになりやすく、水増しになる
- **図種を問わず「1 枚以上」のまま広げる**: requirements に gitGraph、空の図でも通る
- **図種を雛形で示すだけで検査しない**: 雛形をコピーして図を消せば、表だけに戻る
- **図の中身 (ノード数・ID が表に在るか) まで検査する**: 描画前の文字列では脆い。ID の突き合わせは再検討トリガ
- **警告から始める (条件 8 と同じ)**: 版固定で上げる PR が直す機会になる。警告は図を足さない誘因になる
- **生成した HTML / SVG の図**: CEO が手で直せない。**ADR-0002 の本文を書き換える**: 100 行を超える (条件 6 の 1 行だけ直す)

## Consequences

- 良い方向: 人の 16 kind が図で始まり、読み手が表の前に範囲・関係・順序・置き場所を見る
- 代償: 雛形 16 本の書き換え。利用 repo は版を上げるときに 10 種の図を足す。図は手で保つので表とずれることがある
  (承認のときに人が見る)。図の中に文章を逃がす書き方は、行数の警告 (40 行) でしか止められない

## Confirmation

| 手段 | 対象 | 落ちる条件 |
|---|---|---|
| `PersonFormCheck.test.ts` | テスト仕様 08 の全ケース | 空・別図種・閉じない・位置違いを通す / 正しい図を落とす |
| `Role.test.ts`・`TaxonomyGuideSync.test.ts` | 要件 02 §8・`Role.ts`・文書体系ガイド・解説 09 | 16 kind の許す図種が 1 つでも食い違う |
| `TemplatesPersonForm.test.ts` | 雛形 16 本 | 自分の kind の図を冒頭域に持たない / 描画に失敗する (Chromium が無ければ skip を明示) |

## 再検討トリガ

- 図の中の ID が表に無い誤りが承認で 1 件見つかったら、図と表の ID の突き合わせを検査にする
- ELK を同梱したら、雛形にレイアウトの指定を入れるか決める
- adr に図が無いために選択肢が読み取れない指摘が 2 件出たら、adr を図が要る kind に入れる
