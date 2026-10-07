---
id: test-person-diagram
title: テスト仕様 — 人の文書の冒頭の図 (PersonFormCheck の図種と位置)
type: design
kind: test-spec
arc42: 10
id_prefix: TST
status: draft
canonical: true
owners: [eng]
created: 2026-10-08
depends_on: [adr-0011-person-diagram-first, adr-0002-role-boundary-invariants]
relates_to: [test-person-form, audience-directories]
---

# テスト仕様 — 人の文書の冒頭の図 (PersonFormCheck の図種と位置)

> **TL;DR**: 人が承認する文書のうち 16 の kind が、TL;DR の次の節に kind ごとの図種の Mermaid の図を持つことを確かめる
> 検査の詳細設計 (ADR-0011)。03 の P5 (図が 1 枚以上) を、図種・位置・閉じ方・中身まで見る D1〜D5 に置き換える。
> §2 に、空の図・別図種・文末の図・kind の逃げ道を並べ、§3 に雛形 16 本の書き換えを置く

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | ADR-0011 (決定 1〜8) / ADR-0002 (条件 6) / 要件定義書 02 §8 (kind → 図種の正本) | REQ-107 |
| 下流 | `src/core/{Role,MermaidBlocks}.ts`・`src/checks/{PersonFormCheck,MermaidCheck}.ts`・`templates/docs/person/**` とそのテスト | TST-* |

別の 08 にした理由: 03 は 97 行で、図の規則・テスト・雛形の書き換えを足すと 150 行を超える。03 は P5 を 1 行で 08 に渡す。

## 0. 規則

| 語 | 定義 |
|---|---|
| 図 | コードフェンス (` ``` ` か `~~~`、字下げは空白 3 つまで) で、info の最初の語が小文字の `mermaid` のもの。他のフェンスの中・引用 (`>`) の中・タブ字下げは図ではない |
| 閉じた図 | 開きと同じ記号で、開き以上の長さで、info が空で、字下げが空白 3 つまでの閉じのフェンスがある図 (03 の P5 の現実装と同じ)。閉じない図は図ではない (描画確認も飛ばされ、以降の本文が全部図の中身になる) |
| 図種 | 図の中身の先頭から、空行・`%%` で始まる行・先頭の `---` から次の `---` までの設定・複数行の指示 (`%%{` で始まり、`}%%` を含む行で終わる) を飛ばした最初の行の最初の語。`graph` は flowchart、`stateDiagram-v2` は stateDiagram として読む。大文字小文字を区別する。設定や指示が閉じなければ読めない |
| 中身 | 図種の行より後ろに、空でも `%%` 始まりでもない行が 1 行以上ある |
| 数える図 | 閉じていて、図種が読めて、中身がある図 |
| 冒頭域 | frontmatter の次から、最初の表の見出しの行と 2 つ目の `##` 見出しのうち早い方の手前まで (`###` は区切りにならない。フェンスの中は見出しにも表にも数えない) |

| # | 規則 |
|---|---|
| D1 | 対象は、03 の P1・P2 と同じ (新しい構成の `docs/person/**` で、README.md 以外の kind を決められた文書)。要件 02 §8 の許す図種が空でない kind だけに当てる。adr・feature-brief・kind を決められない文書・旧い構成の repo は何も出さない |
| D2 | 許す図種のどれかの数える図が 1 つ以上ある。無ければ違反 (1 行目)。メッセージに理由を出す: 図が無い / 閉じていない (開始行) / 中身が無い / 図種を読めない / 図種 x は kind y では許されない (許すのは a・b) |
| D3 | 許す図種の数える図のうち最初の 1 枚が、冒頭域の中で始まる。外なら違反 (その図の開始行)。D2 が出た文書には出さない。2 枚目以降の位置は見ない |
| D4 | 数える図の bodyLines (図種の行と空行を除く。`%%` の行・設定・指示は数える) が 40 行を超えたら警告 (非ブロッキング。実測の無い値は違反にしない。ADR-0002)。人が一目で読める量に分ける合図 |
| D5 | 図の取り出し (フェンスの読み方・図種・閉じ・中身) は `core` の 1 か所。PersonFormCheck と MermaidCheck が同じ関数を使い、`~~~mermaid`・字下げ 3 つ・小文字の `mermaid` だけ、の扱いが両方で同じになる |

**実装者向けの取り決め**

| 項目 | 内容 |
|---|---|
| 図の取り出し (D5) | `core/MermaidBlocks.ts` の関数が、行の配列と本文の開始行から、図を出現順に `{ startLine (1 始まり。開きのフェンスの行), closed, type (正規化後。読めなければ null), contentLines (「中身」の判定用の行数。図種の行・空行・`%%`・設定・指示を除く), bodyLines (図種の行と空行を除いた行数。`%%` の行・設定・指示を含む。D4 が使う), code (閉じた図だけ。フェンスの中身) }` の配列で返す |
| 使う側 | PersonFormCheck は closed・type・contentLines で数える図を決め (D2・D3)、bodyLines で量を見る (D4)。MermaidCheck は closed の図の startLine と code だけを使う (閉じない図の指摘は D2 が受け持つ。MermaidCheck の旧い開き・閉じの正規表現は、この関数に置き換わる) |
| §8 の表の読み方 | 1 行の 1 列目に ` / ` 区切りで kind が 1 つ以上、2 列目に ` / ` 区切りで図種が 1 つ以上。行の図種は、その行の全 kind に共通 (`solution-strategy / as-is-overview` は 2 kind が同じ図種)。図種は §8 に出る 7 種 (flowchart・mindmap・quadrantChart・gantt・timeline・sequenceDiagram・stateDiagram) |
| `Role.ts` | `needsDiagram: boolean` を `diagrams: readonly 図種[]` に替える (空 = 図を要しない。`needsDiagram` は `diagrams.length > 0` で導く)。型の検査の区分 (○・図・—) は変えない。要件 02 §7 から `(図)` の印を外した (ガイドの §7 の写しの `(図)` 印も外す) ので、突き合わせは §7 の図の項目をやめて §8 を読む |

## 1. テストケース一覧

| ID | 層 | 対象 | 前提 (Given) | 操作 (When) | 期待結果 (Then) | 対応 |
|---|---|---|---|---|---|---|
| TST-101 | 結合 | 雛形 | 雛形 16 本 (§3) を、置き場所の通りに置いた repo | 検査する | 図の違反 0 件。adr・feature-brief は図が無くても 0 件 | D1〜D3 |
| TST-102 | 結合 | 図種 | 許す図種が複数の kind (migration-plan) に flowchart / gantt / timeline のどれか 1 枚 | 検査する | どれも違反 0 件 | D2 |
| TST-103 | 結合 | 図種の読み | `graph TD`・`stateDiagram-v2`・先頭に 1 行の `%%{init: …}%%`・複数行の `%%{init: …` から `}%%` まで・先頭に `---` の設定がある図 | 検査する | それぞれ flowchart・stateDiagram・先頭の語で読み、許す kind では違反 0 件 | D2 |
| TST-104 | 結合 | 位置 | 図が TL;DR の直後 (見出しなし) / 最初の節の中で、同じ節の表より前 / `###` の下 | 検査する | 違反 0 件 | D3 |
| TST-105 | 結合 | 警告 | 図の bodyLines が 40 行ちょうど / 41 行 (`%%` 行を含めて数える) | 検査する | 40 行は何も出ない。41 行は警告 1 件・違反 0 件 | D4 |
| TST-106 | 結合 | 共有 | `~~~mermaid` の図 (構文が壊れている) | PersonFormCheck と MermaidCheck を回す | 前者は図として数え、後者は描画の誤りを出す | D5 |
| TST-107 | 結合 | 対象外 | 旧い構成の repo / `docs/ai/` の文書 / 図が無い README.md | 検査する | 何も出ない | D1 |
| TST-108 | 結合 | 同期 | 要件 02 §8 (複数 kind の行・複数図種の行を含む) と `Role.ts` の `diagrams`。ガイド §4・解説 09 §3 は「16 kind・§8」と書く | `Role.test`・`TaxonomyGuideSync` を回す | 16 kind の図種が一致し、空の kind は adr・feature-brief の 2 つ。本文の「16」が §8 の kind 数と合う | D1 |

## 2. 否定テスト (必須)

| ID | 観点 (手口・境界) | ケース | 期待結果 |
|---|---|---|---|
| TST-301 | 図が無い | 表だけ / 画像のリンクだけ / 別のフェンスの中の mermaid の例だけ / 引用の中・タブ字下げの mermaid だけ | 違反 (D2。1 行目) |
| TST-302 | 空の図 | ` ```mermaid ` の中が空 / 図種の行だけ / `%%` の行だけ | 違反 (D2「中身が無い」) |
| TST-303 | 別図種 | nonfunctional に flowchart だけ / risks に pie / requirements に gitGraph / data-management に erDiagram | 違反 (D2「許されない」。許す図種を出す) |
| TST-304 | 図種の綴り | `flowchar`・`Flowchart`・`quadrantchart`・図種の行が無く node だけ・設定の `---` が閉じない | 違反 (D2「図種を読めない」) |
| TST-305 | 閉じない | ` ```mermaid ` を開いて閉じない (以降の本文・表が全部中身になる) / 閉じが短い (4 つで開いて 3 つで閉じる) / 閉じに info が付く / 閉じを字下げ 4 つにする | 違反 (D2「閉じていない」。開始行) |
| TST-306 | 文末の図 | 「決めてほしいこと」の後ろ / 最初の表の後ろ / 2 つ目の `##` の後ろに図 | 違反 (D3。その図の開始行) |
| TST-307 | 位置の逃げ | 許さない図種 (pie) を冒頭に置き、許す図を文末に置く / `##` をフェンスの中に書いて節の数を減らす / 見出しと区切りの行頭の縦棒を省いた表を図の前に置く | どれも違反 (D3)。フェンスの中の `##` は節の数に入れず、縦棒を省いた表も表として数える |
| TST-308 | info の逃げ | ` ```Mermaid `・` ```mermaidjs `・` ```mermaid-x ` | 図ではない (違反 D2) |
| TST-309 | 先頭の図で足りる | 冒頭域に許す図 + 文末にもう 1 枚 (別図種) | 違反 0 件 (2 枚目以降は見ない) |
| TST-310 | kind の逃げ | frontmatter の kind を消し、置き場所も別の型にする / 置き場所と別の kind を書く | D は何も出さないが、置き場所の検査 (RoleBoundaryCheck・`docs-check`) が違反にする。03 の TST-103 と同じ (CI は両方を回す) |
| TST-311 | 薄い図 | `flowchart TB` と node 1 つだけ | 違反 0 件 (既知の見逃し。薄さは承認のときに人が見る。§4) |
| TST-312 | 文章の逃がし | 図の中の `%%` 行・node の名前に長文を書き、本文の字数 (03 の P7) を逃がす | 違反 0 件。bodyLines (`%%` 行も数える) が 41 行以上になったときだけ D4 の警告 (既知の見逃し。§4) |
| TST-313 | 図で行数を稼ぐ | 図を足して ○ の kind が 101 行になる | 03 の P6 が違反 (図を理由に上限を緩めない) |
| TST-314 | 雛形の描画 | 雛形 16 本の図を `checkMermaidRendering` に渡す | 描画失敗 0 件。Chromium が無い環境は skip と明示 (黙って通さない) |
| TST-315 | 同期の食い違い | §8 の 1 行の図種を変える / 複数 kind の行の片方の kind だけ消す / `Role.ts` の `diagrams` を 1 つ変える / ガイド・解説 09 に旧 6 種の列挙を戻す / 本文の「16」を変える | どれも `TaxonomyGuideSync`・`Role.test` が食い違いを出す |
| TST-316 | 指示の逃げ | `%%{init:` を開いて `}%%` で閉じない (以降の行が全部指示になる) / `---` の設定を閉じない | 違反 (D2「図種を読めない」) |

## 3. 雛形の書き換え (雛形 16 本の期待値)

共通: (1) 表・行の ID・列・「決めてほしいこと」「関連」の位置は変えない (行 ID と状態の列を機械が読み、決定台帳の
「影響する文書」は review-sheet が読むので、表の列は削らない)。(2) 図の節を第 1 節にし、後ろの節番号を送る。他の文書が
節番号で引いていないか grep する (例: ADR-0010 の context-map §3)。(3) 図は `id["表示名 (ID)"]`、id にハイフンを使わず、1 行 1 関係、
5〜12 行。値 (数値・期間・金額) と ELK の指定を書かない。(4) 記入前の雛形は上限の 90% 以内 (100 行 → 90、150 行 → 135)。(5) 文書体系ガイド §4 と解説 09 §3 は図の kind を列挙せず「16 kind・要件 02 §8」と書く (本版で直した)。ガイドの §7 の写しの表 (`(図)` の印) は §7 に合わせて外す。(6) 図の粒度は、まとまり・段階・文書の単位。行 ID の列挙は表と生成一覧に任せる。ID を書くのは、箱 1 つが行 1 つに当たるとき (ロール・重大度・段階・点) だけ。

| 雛形 (`templates/docs/person/…`) | 図種 | 図の中身 (雛形の例) | 表の扱い |
|---|---|---|---|
| design/shared/00-map | flowchart LR | 開始 → 主要な手順 → 完了。いまの図を「何を作るか」の前の第 1 節へ | 役割・入口の表は補足 |
| design/__context__/00-map | flowchart LR | このまとまり →「渡すもの」→ 隣のまとまり。第 1 節へ (概要は第 2 節) | 含む機能・隣接の表は補足 |
| requirements/01-requirements | flowchart TB | 範囲内 (業務要件 → 機能要件) と範囲外 (スコープ外) の 2 つの囲み、利用者・外部。ID は書かない | 5 表とも残す |
| design/shared/01-function-list | mindmap | 根 = システム、枝 = まとまり、葉 = 段階 (Stage 1・2…)。機能名と FN は書かない | 一覧が値の持ち主。カバレッジ確認も残す |
| design/shared/02-solution-strategy | flowchart TB | 既存の 1.1・1.2 を、置き場所の囲み (端末・実行基盤・外部) の中の部品に直す。DB は `[( )]`。線は「使う」だけ | 5 表とも残す |
| design/shared/03-nonfunctional | quadrantChart | 横 = 厳しさ、縦 = 費用への効き、点 = NFR-nnn (高・中・低 → 0.85・0.5・0.15) | 指標の行に「厳しさ」「費用への効き」(高・中・低) の列を、状態の前に足す (位置の元)。目標値の数値は表だけ |
| design/shared/04-permission-matrix | flowchart TB | ロール (PRM-001…) → データ範囲 (PRM-101…)。線の名前は「読み書き」「参照のみ」 | ロール × 機能の表は残す (表が行列そのもの) |
| design/shared/05-data-management | flowchart TB | 国ごとの囲みの中に DB `[( )]`、本番 → 検証は「匿名化」、決済は外部側 | 6 表とも残す |
| design/shared/06-as-is-overview | flowchart TB | 02 と同じ作りで、いま動く部品。実測日はそのまま | 外部と契約・差分の表は補足 |
| design/shared/07-risks-tech-debt | quadrantChart | 横 = 確率、縦 = 影響、点 = RSK-nnn (高・中・低 を 0.85・0.5・0.15) | 確率・影響の列は位置の元として残す |
| design/shared/08-operations | flowchart TB | 検知 → 重大度 (OPS-201) → 連絡 (OPS-101) → 復旧 (OPS-001) → 振り返り | 4 表とも残す |
| design/shared/09-migration-plan | flowchart LR | 先行 (MIG-101) → 条件 (MIG-201・202) → 本番 (MIG-102)、本番 → 切戻し (MIG-301)。日付は書かない | 6 表とも残す。日付で見せるときだけ gantt |
| design/shared/10-glossary | flowchart LR | 語を箱、関係を線の名前に (「1 つの会議室は複数の枠を持つ」) | 用語・使い分けの表は残す |
| decisions/01-decisions | flowchart LR | 箱 = 文書。未決を持つ文書は「未決あり」へ破線、決定だけの文書は「決定済み」へ実線。ID は書かない | 「影響する文書」の列は残す。AUTOGEN 区間は動かさない |
| design/__context__/flows/__flow__・screens/__screen-group__ | flowchart (変更なし) | いまの図が第 1 節にある | 変更なし |
| decisions/__year__/NNNN-__slug__・features/__feature__ | 図なし | 変更なし (ADR-0011 決定 2) | 変更なし |

## 4. トレーサビリティ

| 確認 | 結果 |
|---|---|
| ADR-0011 との対応 | 決定 1 = 要件 02 §8・D1 / 決定 3 = D2〜D4 / 決定 6 = D5 / 決定 4・5・8 = §3 の共通 (人が承認で見る) / 決定 7 = TST-314 |
| 機械で確かめないもの | 図が文書の内容と合うか / 図と表の ID の突き合わせ / DB が筒か・TB か / 図の値が行とずれていないか / 図の薄さ (node 1 つ) / 図の中の文章 (TST-311・312) / 描画できるか (`mermaid-check` は既定 OFF。雛形だけ TST-314) |
| 03 との関係 | 03 の TST-102・TST-306 の図の分は、08 の D1〜D3 に読み替える。P6 (行数)・P7 (字数) は 03 のまま (TST-313) |
