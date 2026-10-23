---
id: test-trace-template-adoption
title: テスト仕様 — つながりの検査の雛形・番号の帯・利用 repo への当て方
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
relates_to: [test-trace-check, test-doc-graph]
---

# テスト仕様 — つながりの検査の雛形・番号の帯・利用 repo への当て方

> **TL;DR**: 規則 (テスト仕様 13) を通すために、雛形の欄とコードの先頭行を直す。雛形は ID の行を 1 つも持たず、空のままで違反を出さない。
> 番号の帯は雛形で宣言し、利用 repo の設定で上書きできる。

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | ADR-0015 (方針・番号の補助の未決 ID-NEXT) | — |
| 下流 | 雛形 (§1 の一覧)・`src/core/trace/` (帯は `RulesB.ts` と `TraceConfig.ts`) | TST-94x |

## 0. 規則

- **順序の依存**: (1) PR #28 (templates/ の並べ直し) の後に D1〜D5・C1〜C4 を直す。(2) 決定台帳の branch の merge の後に D6 を直す。(1) より前に直すと、並べ直しと衝突する。
- **T2 の適用**: D6 の merge までは T2 (DEC の作る物) を適用しない。雛形の決定表に「影響の種類」列が無いため。
- **MD-11**: 直すのは既存のファイルの中身だけで、フォルダは増やさない。それでも MD-11 の検査は変種の全体に走るので、直した後に通すことを TST-941 で確かめる。新しいフォルダを足すときだけ `TemplatesRegistry` の登録が要る (今回は要らない)。
- **欄の向き**: 雛形の frontmatter に `trace_columns: ["対応 REQ:up", "対応 SCR:down"]` と置き、欄の名前を向きに写す。利用 repo は `.igeta.json` の `trace.columns` で上書きできる。
- **空のままで通す**: 表はヘッダだけにし、データの行を 1 つも置かない (空の行も ID の形なら定義になる)。例は HTML コメントに書く (検査の対象外)。`@trace` だけの先頭行は未記入の警告。展開直後の文書は違反 0。
- **番号の帯 (T11)**: 雛形の frontmatter に `trace_bands: ["業務要件:0", "機能要件:1", "スコープ外:4"]` と宣言すると、節の定義の百の位が帯と一致しなければ違反。宣言の無い節と文書は検査しない。利用 repo は `.igeta.json` の `trace.bands` で上書きできる。
- **番号の補助**: `igeta id next` を作るかは ADR-0015 の ID-NEXT で決める。
- **利用 repo への当て方**: (1) `.igeta.json` に `trace` を足す (`kinds`・`code`・`columns`・`bands`・`strictEdges`)。(2) `igeta trace --update-baseline` で基準を作り、違反の件数を PR に書く。(3) 基準を commit する。(4) 違反を直すたびに基準から消す。(5) 結果は利用 repo の GitHub Issue 1 本に件数と残りを記録する。直す順は DEC → REQ → FN → SCR・API → TST。

## 1. 直す雛形 (ファイルのパス)

| # | パス | 直し方 |
|---|---|---|
| D1 | `templates/docs/person/requirements/01-requirements.md` | `trace_bands` を置く。業務・機能の表の例の行 (REQ-001・REQ-101・REQ-102・REQ-201) を消し、ヘッダだけにする |
| D2 | `templates/docs/person/design/shared/01-function-list.md` | 例の行 (FN-001) を消す。`trace_columns` を置く |
| D3 | `templates/docs/person/design/__context__/screens/__screen-group__.md` | 例の行 (SCR-001・101・201・301・401) を消す。`trace_columns` を置く |
| D4 | `templates/docs/ai/specs/__context__/api/__resource__.md` | AUTOGEN 区間と区間の外の表の例の行 (API-001) を消す |
| D5 | `templates/docs/ai/specs/__context__/tests/__feature__.md` | 例の行 (TST-201・202・301・302) を消す。`trace_columns` を置く |
| D6 | `templates/docs/person/decisions/01-decisions.md` | 決定台帳の merge 後。「影響の種類」列 (`作る物`・`方針のみ`) を足し、例の行 (DEC-001・OPEN-001) を消す |
| C1 | `templates/frontend/admin/src/features/__feature__/presentation/screen/__Feature__Screen.tsx` | 先頭行を `// __Feature__ の画面。 @trace` にする (SCR) |
| C2 | 同 `presentation/components/__Feature__{Form,Row,Toolbar}.tsx` | `// __Feature__ の画面部品。 @trace` (SCR) |
| C3 | 同 `infrastructure/endpoint.ts` | `// __Feature__ の API の呼び出し口。 @trace` (API) |
| C4 | 同 `*.test.ts(x)` のうち screen・components・endpoint のテスト | `// __Feature__ のテスト。 @trace` (TST) |

- 印 `__Feature__` などは MD-08 のとおり、1 単位のフォルダの中だけで使い、展開後のファイルには残らない。

## 2. テストケース一覧

| ID | 種類 | 期待 |
|---|---|---|
| TST-941 | 雛形を 1 単位展開し、`TraceCheck` と MD-11 を通す | 違反 0。警告は未記入の件数だけ |
| TST-942 | 例の行が残った雛形 (D1〜D5 を直す前) | T1・T3 が当たる (直したことの確認) |
| TST-943 | D6 の merge 前に T2 を検査する | 検査しない (T2 は未適用) |
| TST-944 | 帯: 機能要件の節に 4 百番台の行 | T11 違反 |
| TST-945 | 帯: 宣言の無い節の行は、どの番号でも違反 0 | 検査しない |
| TST-946 | 帯: `.igeta.json` の `trace.bands` で上書き | 上書きの帯で検査する |
| TST-947 | 節名が見出しと一致しない帯の宣言 | 宣言は無効として警告 |
| TST-948 | `trace.columns` の上書き | 上書きの向きで辺を数える |
| TST-949 | 基準の増加 (origin と比べる) | 違反。origin が無いときは `cannot-check` |

## 3. 否定テスト (必須)

| # | 誤った直し方 | 期待 |
|---|---|---|
| N1 | 雛形にデータの行を 1 つ残す | 定義として数えられ、展開直後に T3 違反 (TST-942) |
| N2 | 例の ID を仮データとして置く | 仮データ禁止。ID の定義は、利用者が書いて初めて生まれる |
| N3 | 印 `__x__` を展開後のファイルに残す | MD-08 の検査で止める |
| N4 | 機能要件の節に 4 百番台の行を置く | T11 違反 (TST-944) |
| N5 | 決定の雛形を、決定台帳の merge 前に直す | 別 branch と衝突する。D6 は merge 後だけ (TST-943 で T2 を外す) |
| N6 | 帯の宣言を節名で書かずに番号だけ書く | 宣言が読めず、警告 (TST-947 と同じ扱い) |

## 4. トレーサビリティ

| 対象 | 確かめる TST |
|---|---|
| 雛形の欄・先頭行 (D1〜D5・C1〜C4) | TST-941・TST-942 |
| 空で通す書き方 (§0) | TST-941・TST-945 |
| 帯 (T11) | TST-944・TST-946・TST-947 |
| 欄の向き | TST-948 |
| 基準 | TST-949 |
| 決定の雛形 (D6・T2) | TST-943 |
| 否定 (§3) | N1〜N6 |
