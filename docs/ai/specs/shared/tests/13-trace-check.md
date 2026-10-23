---
id: test-trace-check
title: テスト仕様 — 設計書のつながり (ID の上流・下流、コードの @trace、基準)
type: design
kind: test-spec
context: shared
arc42: 10
id_prefix: TST
status: draft
canonical: true
owners: [eng]
created: 2026-10-23
depends_on: [adr-0015-trace-check]
relates_to: [test-doc-graph]
---

# テスト仕様 — 設計書のつながり (ID の上流・下流、コードの `@trace`、基準)

> **TL;DR**: 決定・要件・機能・画面・API・表・テスト・コードの ID が、欄 (上流・下流) とコードの先頭行で届くかを `TraceCheck` で確かめる。
> 既存の違反は基準ファイルに記録し、新しい違反と基準の増加だけを落とす。ID の定義と参照は既存の部品から import する。

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | ADR-0015 (方針・例外の理由) | — |
| 下流 | `src/checks/TraceCheck.ts`・`src/core/trace/` (§0.5)・`src/cli/commands/TraceCommand.ts` | TST-9xx |
| 部品 (import のみ) | `core/IdDefinitions.ts`・`core/DocReferences.ts`・`core/ContextGraph.ts`・`core/MarkdownTable.ts`・`core/GitRef.ts` | — |

## 0. 規則

**定義**: 行頭セルが ID の形 (`trace.kinds` の接頭辞) の行。数えるのは `trace_columns` を宣言した文書の表だけ。OPEN- など `trace.kinds` に無い接頭辞は数えない。
**参照**: `trace_columns` で上流・下流と宣言された欄の ID。本文・引用・否定の文は数えない。修飾 ID は `DocReferences` の `qualified-id` で読む。
**context**: T1 の重複は同じ context の中だけ。`ContextGraph` の context が違えば、同じ ID があっても違反にしない。

| # | 規則 (上流 → 下流) | 違反の重さ |
|---|---|---|
| T1 | (a) 同じ context で、定義が 2 文書以上ある、または同じ文書で 2 回採番されている。(b) 自分の差分で増えた ID (作業ツリーの定義 − 同じ文書の origin/main の定義) が、origin/main のどこかの定義と同じ context で衝突する | 違反 |
| T2 | DEC のうち「影響の種類」が `作る物` の行は、下流 (REQ か FN) を 1 件以上指す。D6 の merge までは未適用 | 違反 |
| T3 | REQ は、下流に FN を 1 件以上持つ (FN の上流欄が REQ を指して届く) | 違反 |
| T4 | FN は、上流に REQ を 1 件以上、下流に SCR か API を 1 件以上持つ | 違反 |
| T5 | SCR は、上流に FN を 1 件以上持つ | 違反 |
| T6 | API は次のどれかを満たす。(a) 上流に SCR を持つ。(b) 上流の FN が、下流に SCR を持つ。(c) 上流の FN または REQ から上流をたどると DEC に届く (FN → REQ → DEC も可)。FN だけを指し、その FN が画面にも決定にも届かない API は違反 | 違反 |
| T7 | TBL は、**コードの `@trace`** から参照される。TST からの参照では満たさない | 警告 (基準が空になったら `trace.tblRule: "error"` で違反) |
| T8 | TST は、テストの文書の定義と、テストのコードの `@trace` の両方に現れる | 違反 |
| T9 | 辺が片方だけに書かれている (A の下流に B、B の上流に A が無い)。例外: FN が下流に SCR を書き、その SCR の上流に FN が無い組み合わせは違反 | △ 警告 (例外と `trace.strictEdges: true` は違反) |
| T10 | `@trace` や欄の ID (`trace.kinds` の接頭辞) が、どの定義にも無い | 違反 |
| T11 | 帯を宣言した節の定義の百の位が、帯と違う (宣言は テスト仕様 14) | 違反 |

**種類**: 既定は DEC・REQ・FN・SCR・API・TBL・TST。`trace.kinds` で上書きする。その種類の定義が 0 件の repo では、その種類に関わる規則を検査しない。

**コードの `@trace`**: ファイルの先頭行 (MD-09 の概要の行) に `@trace` の後ろで ID を空白区切りで書く。例 (架空): `// 在庫の単位を表す部品。 @trace SCR-101 FN-010`。2 行目以降は見ない。対象は `trace.code` の glob。glob に入るのに `@trace` が無いファイルは違反。`@trace` だけで ID が 0 件のものは未記入の警告 (基準には入れない)。

**基準**: repo 直下の `.igeta-trace-baseline.json` に、**違反だけ**の指紋 (規則・ID・ファイル。行番号は入れない) を記録する。警告は入れない。基準に有る違反は `baselined` と表示して落とさない。減らすのは `igeta trace --update-baseline` だけ。増やすのは禁止し、origin の基準より指紋が増えていたら違反にする。origin が無いときは `cannot-check`。

**木**: `igeta trace <ID>` は上流と下流の木を出す。○ 辺が両方向に揃い、先が定義されている。△ 片方向 (T9)。✗ 必須の辺が無い、または先が未定義 (T10)。`--mermaid` で Mermaid の `flowchart TB` も出す。`DiffTraceModule` とは別物 (そちらは PR の変更ファイルを辿る)。

### 0.5 ファイルの割り振り

| ファイル | 責務 | 公開の口 (引数 → 戻り値) |
|---|---|---|
| `core/IdDefinitions.ts` (広げる) | 行頭セルの定義を行番号つきで返す | `collectRowDefinitions(lines, prefix): {token, line}[]` (重複を残す。既存の `collectRowDefinedTokens` はこれを使う形にし、挙動は変えない) |
| `core/trace/TraceIndex.ts` | 文書の定義・参照・context の索引 | `buildIndex(docs): TraceIndex` |
| `core/trace/RulesA.ts` | T1〜T6 | `checkRulesA(index, originIndex): Violation[]` |
| `core/trace/RulesB.ts` | T7〜T11 | `checkRulesB(index, codeTags, config): Violation[]` |
| `core/trace/CodeTags.ts` | 先頭行の `@trace` を読む | `scanTags(files: {path, lines}[]): CodeTag[]` |
| `core/trace/Baseline.ts` | 基準の適用・増加の判定 | `applyBaseline(v, base): {fresh, baselined}`・`grew(cur, origin): boolean` |
| `core/trace/Tree.ts` | `trace <ID>` の木と Mermaid | `buildTree(index, id): Tree`・`render(tree, mode): string` |
| `core/trace/TraceConfig.ts` | `.igeta.json` の `trace` を読み、既定を足す | `readTraceConfig(root): TraceConfig` |
| `checks/TraceCheck.ts` | `Check` の口。読み込みと上の関数の呼び出しだけ | `run(ctx): Violation[]` |
| `cli/commands/TraceCommand.ts` | CLI の口 (`--mermaid`・`--update-baseline`)。git の参照は CLI 側で読む | — |

- `src/core/trace/` は 7 本体 (MD-11 の上限と同じ)。`IdDefinitions.ts` の追加と `IgetaConfig` の `trace` の読み取りは、この作業の範囲に入れる。
- 新しい frontmatter のキー (`trace_columns`・`trace_bands`) は、`Frontmatter.ts` と `DocGraphCheck` に未知のキーを落とす検査が見当たらないので通る。将来そうした検査を足すなら、許可キーにこの 2 つを足す。
- 各ファイルは 150 行以内、関数は 40 行以内に収める見積もり。

## 1. テストケース一覧

| ID | 種類 | 入力 (架空) | 期待 |
|---|---|---|---|
| TST-901 | 正常 | DEC(作る物)→FN→REQ・SCR、SCR→FN、両方向が揃う | 違反 0、○ のみ |
| TST-902 | 抜け T3 | REQ-801 の下流に FN が無い | 違反 (REQ-801) |
| TST-903 | 抜け T4 | FN-010 の上流が空 | 違反 |
| TST-904 | 片方向 T9 | FN-010 が SCR-101 を下流に書き、SCR-101 は上流に書かない (FN 以外の例) | △ |
| TST-905 | T9 例外 | FN-010 が下流に SCR-101、SCR-101 の上流に FN-010 が無い | 違反 |
| TST-906 | 書き間違い | 欄に `FN-10` (3 桁でない) | ID として数えない |
| TST-907 | 書き間違い T10 | 欄に `FN-999` (定義なし) | 違反 |
| TST-908 | 重複 T1(a) | `FN-010` を同じ文書の表で 2 回採番 | 違反 |
| TST-909 | 重複 T1(b) | PR の差分で新しく作った `REQ-120` が、origin/main の別文書にも定義されている | 違反 |
| TST-910 | 誤検知 T1 | context A と B に、同じ `REQ-801` がある | 違反 0 |
| TST-911 | 誤検知 | `trace_columns` を宣言していない文書に、同じ ID の表がある | 違反 0 |
| TST-912 | 誤検知 | `OPEN-001` の表 (`trace.kinds` に無い接頭辞) | 数えない |
| TST-913 | T6 | API が上流に SCR を持つ | 違反 0 |
| TST-914 | T6 | API の上流が FN だけで、その FN が SCR にも DEC にも届かない | 違反 |
| TST-915 | T6 | API の上流 FN が下流に SCR を持つ | 違反 0 |
| TST-916 | T7 | TBL を TST の欄から参照、コードの `@trace` は無い | 警告 (満たさない) |
| TST-917 | T8 | テスト文書に `TST-007`、テストのコードの `@trace` に無い | 違反 |
| TST-918 | コード | 先頭行に `@trace SCR-101 FN-010` | 辺が成立 |
| TST-919 | コード | `@trace` を 2 行目に書く | 無視され、そのファイルは「無し」で違反 |
| TST-920 | 未記入 | `@trace` だけの先頭行 | 警告。基準に入らない |
| TST-921 | 基準 | 既存の違反を基準に記録して再実行 | 違反 0、`baselined` が出る |
| TST-922 | 基準 | 基準に新しい指紋を手で足す (origin と比べる) | 違反 |
| TST-923 | 基準 | 違反を直して `--update-baseline` | 指紋が消える |
| TST-924 | 木 | `igeta trace DEC-901` (未定義) | 終了コード 2 |
| TST-925 | 旧い構成 | 定義が 0 件の repo | 検査しない (違反 0) |

## 2. 否定テスト (必須)

| # | 悪用・誤検知 | 期待 |
|---|---|---|
| N1 | 欄に意味の無い ID を書いて通す | 機械では止めない。レビューシート (05) の欄の確認で、人が上流かを見る |
| N2 | 本文に「FN-010 参照」と書いて辺にする | 数えない。違反のまま残る |
| N3 | コードの文字列 `"FN-010"` で通す | 数えない (先頭行の `@trace` だけを見る) |
| N4 | 欄に `FN-010 は対象外` と書く | ID として数える。欄には ID だけを書く (レビューで止める) |
| N5 | 基準ファイルを手で増やす | origin との比較で違反。origin が無ければ `cannot-check` |
| N6 | `@trace` だけ書いて未記入で通す | 警告として件数を末尾に出す。基準には入れない (TST-920) |
| N7 | 別 branch が同じ ID を振る | T1(b) で落ちる (TST-909)。CI は merge 結果で回す |
| N8 | 空の欄 (`-`) や全角の ID (`ＦＮ-010`) | ID の形ではない。欠落として T3〜T6 で落ちる |

## 3. トレーサビリティ

| 規則・機能 | 確かめる TST |
|---|---|
| T1 | TST-908・TST-909・TST-910 |
| T2 | TST-901 (DEC の作る物)。D6 の merge 後に再実行 |
| T3 | TST-902 |
| T4 | TST-903 |
| T5 | TST-901 |
| T6 | TST-913・TST-914・TST-915 |
| T7 | TST-916 |
| T8 | TST-917 |
| T9・例外 | TST-904・TST-905 |
| T10 | TST-906・TST-907・TST-919 |
| T11 | テスト仕様 14 の 944 番 |
| 基準 | TST-921・TST-922・TST-923 |
| 木 | TST-924 |
| 旧い構成・誤検知 | TST-911・TST-912・TST-925 |
| 否定 | N1〜N8 |
