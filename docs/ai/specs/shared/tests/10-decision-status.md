---
id: test-decision-status
title: テスト仕様 — 決定の状態・承認の記録・フォルダ (decision コマンドと docs-check)
type: design
kind: test-spec
context: shared
arc42: 10
id_prefix: TST
status: draft
canonical: true
owners: [eng]
created: 2026-10-22
depends_on: [adr-0013-decision-status-folders]
relates_to: [test-person-form, test-doc-graph, test-review-sheet, test-decision-migration]
---

# テスト仕様 — 決定の状態・承認の記録・フォルダ (decision コマンドと docs-check)

> **TL;DR**: ADR の状態を変える書き込み口 `decision-accept|reject|supersede|amend`、承認待ちを洗い出す `decision-pending`、
> 状態・履歴・フォルダ・台帳の列を見る docs-check の規則 (DS1〜DS14) の詳細設計。手書きの `accepted` は、履歴の行・根拠の実在・
> 本文の指紋・追記のみで見分けて落とす。日付で変わるもの (待ちの日数) は警告にし、違反にしない

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [ADR-0013](../../../../person/decisions/proposed/0013-decision-status-folders.md) (決定 1〜10) | — |
| 下流 | `src/core/decision/`・`src/cli/commands/decision/` (§GitHubPort と割り方はテスト仕様 12)・`src/checks/DecisionStatusCheck.ts`・`DocGraphCheck.ts` の索引・`DocsMigrate*` の 1 段 とそのテスト | TST-* |

## 0. 規則

**履歴** = ADR 本文の `## 承認の履歴` の表。列は 日付・事象・前→後・決めた人・根拠・根拠 commit・本文指紋・メモ。`status` は frontmatter。
**本文指紋** = ADR の本文 (frontmatter と履歴の節を除く) を、ADR-0007 の正規化で取った SHA256。文書へのリンクは文書 id で数え、
id で数えられない相対リンク (画像・コード・docs/ の外) は、repo ルートからのパスに解決してから数える。移動でリンクの深さが変わっても指紋は変わらない。
**approvers** = `.igeta.json` の `decisions.approvers: [{ name, github }]`。`github` は merge・close した人の GitHub 名との照合に使う。

| # | 規則 (docs-check。違反 = 終了コード 1。警告は 0) |
|---|---|
| DS1 | 置き場所: proposed → `decisions/proposed/`、accepted・amended → `accepted/<年>/`、rejected → `rejected/<年>/`、superseded・deprecated → `retired/<年>/`。年は最後の承認・却下の行の日付の年 (改訂・置換の行では動かない。`retired/` は旧い承認の年のまま)。違えば違反 (ファイルの 1 行目) |
| DS2 | 一意: 同じ id か同じ番号が、フォルダをまたいで 2 本以上あれば違反 (既存の番号重複の検査を `decisions/` の全体へ広げる) |
| DS3 | 履歴と状態: `status` が履歴の最後の「後」と違えば違反 (行が 0 本なら proposed のはず)。proposed でない ADR は行を 1 本以上持つ |
| DS4 | 証跡の形: 承認・改訂の行は、決めた人が `approvers` の名前、根拠が `https://github.com/<owner>/<repo>/` の後に `pull/<n>` か `commit/<sha>`、根拠 commit が 40 桁の 16 進で、全部が埋まる。却下の行は根拠 commit を空にでき、根拠は PR か Issue の URL (DS5 の対象外)。置換の行の根拠は置いた ADR の id。owner と repo は `origin` と同じ |
| DS5 | 証跡の実在 (承認・改訂の行。git がある時): 根拠 commit が HEAD の履歴にあり、その commit の中に同じ id の ADR があり、その本文指紋が行の本文指紋と同じ。さらに、その commit がこの ADR を追加または変更している (第 1 親の木に同じ id の ADR が無いか、指紋が違う。ADR が既に同じ本文で main にある後続の、無関係な PR は根拠にできない)。確かめられない clone (浅い・git 無し) は、この規則だけ検査不能 (2) |
| DS6 | 承認後に本文を変えない: accepted・amended・rejected の ADR の現在の本文指紋が、最後の承認・改訂・却下の行の本文指紋と同じ。違えば違反 (直し方は `amend`)。最後の行が事象 `移行前` なら対象外 (DS9) |
| DS7 | 追記のみ: `--base <ref>` (CI は PR の対象 branch) の履歴の行が、1 行も消えず・変わらず・順が同じで、新しい行は末尾だけ。base と `status` が違うのに行が増えていなければ違反。base を読めなければ警告 |
| DS8 | 覆す: `supersedes: [a]` を持つ X と `superseded_by: X` を持つ a は対。X が accepted・amended で a が accepted のまま、a が retired なのに X が proposed、循環、片側だけ、`superseded` で `superseded_by` が無い、は違反。1 行目が `移行前` の a は、置いた X が移行の差戻しで proposed でも、`superseded_by` が無くても咎めない (旧い repo の「根拠の無い置換元と先」の組を移せるように) |
| DS9 | 遷移: proposed → accepted・rejected / accepted・amended → amended・superseded / rejected・superseded → なし。例外は事象 `差戻し` (移行だけ。根拠の無い accepted・rejected を proposed に戻す。メモに旧い状態と日付を必須)。`deprecated` は書き込み口が無いので今回は対象外: 新しく付けると DS3 で落ちる。既にある superseded・deprecated は、移行が事象 `移行前` の履歴を 1 行起こして `retired/` に置く (根拠は `移行前 (未記入)`。DS4〜DS6 の対象外で、警告として数える)。旧 amended も `移行前` (未記入→amended) の 1 行で `accepted/` に置く。**`差戻し` と `移行前` は移行の書き手だけが書くので、履歴の 1 行目にだけ許す。2 行目以降にあれば違反** (承認済の ADR に手書きで足して proposed/・retired/ へ落とす改ざんの対策。テスト仕様 12 の TST-509・510) |
| DS10 | 再提案: 却下された ADR は戻さず、新しい番号で出す。`reopens: <id>` は rejected の ADR だけを指す。他を指せば違反 |
| DS11 | 待ち: proposed は `awaiting` (人名) を持つ。無ければ違反 (DS12 の条件の repo だけ。旧配置では警告にとどめる)。経過日数 = 今日 − 対象 branch で初めて現れた commit の日付 (浅い clone で辿れなければ `created` に落とし、出力にそう書く)。差戻しの移行は `awaiting` を `approvers` の先頭の名前で埋める (人の承認のパスの PR で直せる)。`decisions.staleDays` (既定 14) を超える・`due` を過ぎる、で警告 1 件 (番号・持ち主・経過日数・期限)。当日は超過にしない |
| DS12 | 旧配置: `proposed/` などの状態のフォルダが 1 つも無く `<年>/` に ADR がある repo は、警告 1 件だけ (`docs-migrate` を促す)。状態のフォルダが 1 つでもあれば、`<年>/` 直下の ADR は DS1 の違反。**有効化の条件**: DS1・DS3・DS5・DS6・DS11 の違反はこの条件 (状態のフォルダが 1 つでもある) の repo だけ。DS13 は台帳の見出しに `状態` の列がある repo だけ。どちらも、移行するまで既存の repo を赤くしない |
| DS13 | 台帳: DEC・OPEN の表の列は ADR-0013 決定 8 のとおり。状態の語は DEC が 決定・廃、OPEN が 未決・暫定・解決。印と語が合う (✅ 決定・解決 / ⏳ 未決・暫定 / ↪ 廃)。DEC の決定は根拠が空でない (URL・実在する repo 相対パス)。OPEN の未決・暫定は持ち主と期限 (日付) がある。OPEN の解決は根拠に DEC の ID。行は消さない (消えれば DS7 と同じ比べ方で違反)。期限切れは警告。移行の印 `移行前 (未記入)` (根拠) と `未定` (期限) は、対象 branch に既にある行 (ID で突き合わせる。base に状態の列が無ければ全行) にだけ許し、警告として数える。新しい行に書けば違反 |
| DS14 | 索引: `adr-index` の区間は、承認待ち・承認済・却下・置換の 4 つの表 (0 件の表は `_該当なし_`)。列と順は ADR-0013 決定 7。順は番号。日付で変わる値を入れない。印 (✅⏳❌↪) は語の前に付き、表の見出しの状態と合う (承認待ちの表に ✅ があれば違反。手書きの区間は索引のずれ) |

**コマンド** (全部 `--dry-run` あり。計画を `MOVE`・`APPEND`・`REWRITE`・`SET` の行で出し、何も書かない)

| 形 | 動き |
|---|---|
| `decision-accept <id\|番号> --by <名前> --evidence <URL>` | proposed → accepted。`gh` で PR が merged・merge した人が `--by` の GitHub 名・根拠 commit に今の本文がある、を確かめる。履歴に 1 行追記し、`status`・`awaiting` の削除・移動・リンクの書き換え (テスト仕様 07 の M12 と同じ書き換え器)・索引の再生成 |
| `decision-reject <id> --by --evidence --reason <1 行>` | proposed → rejected。根拠は PR か Issue を `--by` が閉じた・merge した記録 |
| `decision-supersede <旧> --by-adr <新>` | 新が accepted・amended のとき、旧を retired へ。新に `supersedes` が無ければ足す。根拠は新の承認の行から取る |
| `decision-amend <id> --by --evidence` | accepted・amended の本文を変えた後、新しい PR を根拠に改訂の行を足す。移動しない |
| `decision-pending [--json] [--stale-days N]` | 読むだけ。proposed を経過日数の降順で、番号・題・持ち主・期限・初めて現れた commit の PR・実行すべき `decision-accept` の候補で出す。候補は書かない (実行時に確かめる)。出力の末尾に必ず「merge した人が人かは確かめられない (AI と同じ GitHub アカウントの場合)。記録の PR は人が読んで merge する」を出す |

終了コード: 0 = 完了。1 = 拒否 (遷移・形・approvers・PR が merged でない・commit に ADR が無い・指紋の不一致・作業ツリーが clean でない・直後の本文リンク切れ)。
2 = 検査不能 (`gh`・git・`.igeta.json` が読めない)。書く前に全部確かめ、書くのは一時ファイルから rename で、失敗は書く前の状態に戻す。移動で空になった元のフォルダは、手を入れていない生成索引の README.md だけなら README ごと消す。手書きの目的行がある README.md は残し、索引の区間だけ空にする。

## 1. テストケース一覧

| ID | 層 | 対象 | 前提 (Given) | 操作 (When) | 期待結果 (Then) | 対応 |
|---|---|---|---|---|---|---|
| TST-101 | 結合 | accept | `proposed/0003` と、それを含み approver が merge した PR (`GitHubPort` の fixture。テスト仕様 12 §1) | accept | `accepted/2026/` へ移り、履歴に 1 行 (7 列が全部埋まる)、`status: accepted`、索引の承認済の表に ✅・承認日・決めた人・根拠リンク。終了 0 | DS1・3・4・14 |
| TST-102 | 結合 | reject | proposed と、approver が閉じた PR | reject (`--reason` 付き) | `rejected/2026/`、却下の表に ❌・根拠 | DS1・4・14 |
| TST-103 | 結合 | supersede | 旧 (accepted) と新 (accepted) | supersede | 旧が `retired/` へ、旧に `superseded_by`、新に `supersedes`。承認済の表の新に「覆す」、置換の表の旧に「覆した ADR」 | DS8・14 |
| TST-104 | 結合 | amend | accepted の本文を直し、新しい PR が merge 済 | amend | 改訂の行と新しい本文指紋。`status: amended`、フォルダはそのまま | DS6 |
| TST-105 | 結合 | pending | 経過 20 日・期限切れ・3 日の 3 本 | pending | 降順の 3 行。持ち主と候補コマンド付き。`--json` は同じ内容 | DS11 |
| TST-106 | 結合 | 全部整合 | 4 つのフォルダに各 1 本 | docs-check | 違反 0 | DS1〜DS10 |
| TST-107 | 単体 | 索引の決定性 | 同じ ADR の集合 | 日付を変えて 2 回生成 | 出力が同じ。経過日数が無い | DS14 |
| TST-108 | 結合 | 台帳 | DEC 決定 (根拠のリンク) と OPEN 未決 (持ち主・期限) | docs-check | 違反 0。期限切れの OPEN は警告 1 件 | DS13 |
| TST-109 | 結合 | 旧配置 | `<年>/` の ADR だけ | docs-check | 警告 1 件・違反 0 | DS12 |
| TST-110 | 結合 | リンク | 他の文書が旧パスへ相対リンクを持つ | accept | 全部の追跡している `.md` の相対リンクが新パスへ。docs-check の `[link]` が 0 | DS1 |
| TST-111 | 結合 | dry-run | proposed 1 本 | accept `--dry-run` | `MOVE`・`APPEND`・`REWRITE`・`SET` の行だけ。作業ツリーは同じ | コマンド |
| TST-112 | 結合 | 移行 | test-decision-migration/TST-404 を参照 (重複させない) | — | — | DS1・3・5 |

## 2. 否定テスト (必須)

| ID | 観点 (手口・境界) | ケース | 期待結果 |
|---|---|---|---|
| TST-301 | 手書きの accepted | `status: accepted` にして履歴を足さない | DS3 の違反 |
| TST-302 | 行も手書き | 履歴に行を書き、根拠 commit を作り話の 40 桁にする | DS5 の違反 |
| TST-303 | 根拠の偽装 1 | 根拠が blog・PR の `/files` URL・承認の根拠としての Issue | accept は拒否 (1)。履歴に手書きなら DS4 |
| TST-304 | 根拠の偽装 2 | 実在する PR だが、この ADR を含まない / ADR が既に main にある後続の、無関係な merge 済み PR | 拒否 (1)。手書きなら DS5 |
| TST-324 | 別 repo | 他の repo の merge 済み PR の URL | 拒否 (1) (`origin` と違う)。手書きなら DS4 |
| TST-325 | 本文が違う commit | merge 済みで ADR を含むが、今の本文と指紋が違う commit | 拒否 (1)。手書きなら DS5 |
| TST-326 | 却下の根拠 | 却下の行に根拠 commit が無く、根拠が Issue の URL | DS4・DS5 を通る。承認の行で commit が空なら DS4 の違反 |
| TST-305 | 未 merge | PR が open か、merge せずに close | accept は拒否 (1) |
| TST-306 | 人の取り違え | merge した人の GitHub 名が `approvers[].github` に無い / `--by` が `approvers` の名前に無い / `--by` の `github` と merge した人が別 | 拒否 (1) |
| TST-307 | 承認後の本文 | 承認後に決定の 1 語を変え、履歴は触らない | DS6 の違反。`amend` 後は通る |
| TST-308 | 過去の書き換え | 履歴の過去の行の根拠を差し替える / 行を消す | DS7 の違反 (対象 branch との比較) |
| TST-309 | 状態だけ変える | base が proposed で、行を足さずに `rejected` へ | DS3・DS7 の違反 |
| TST-310 | 同じ id が 2 フォルダ | `proposed/` に旧い写しが残り、`accepted/` にも同じ id | DS2 の違反 |
| TST-311 | 番号だけ同じ | id が違うが番号 0007 が 2 本 | DS2 の違反 |
| TST-312 | 置き場所の食い違い | accepted の ADR が `proposed/` にある / 年のフォルダの年が違う | DS1 の違反 |
| TST-313 | 移動の途中の失敗 | 書き込みの途中で `gh` を落とす / 作業ツリーが dirty | 作業ツリーは前と同じ。拒否 (1) か検査不能 (2) |
| TST-314 | 移動後のリンク切れ | 本文リンク・画像・`docs/` の外の README.md のリンク / コードスパンの旧パス | リンクは全部新パス。コードスパンは書き換えず、`NOTICE` で一覧。新しい切れが残れば拒否 (1) し戻す |
| TST-315 | 却下の後 | 却下した ADR に accept / 状態を proposed に手書き | 拒否 (1) / DS9 の違反 |
| TST-316 | 再提案 | 新番号で `reopens` が rejected を指す / accepted を指す | 通る / DS10 の違反 |
| TST-317 | 置換の片側 | `superseded_by` だけがある / X が accepted で a が accepted のまま / 循環 | DS8 の違反 |
| TST-318 | 印と語 | 台帳に「✅ 未決」/ 索引の承認待ちの表に ✅ / 索引を手書きで直す | DS13 の違反 / DS14 の違反 / 索引のずれ |
| TST-319 | 台帳の欠け | DEC の決定で根拠が空 / OPEN に持ち主か期限が無い / DEC の行を消す | DS13 の違反 |
| TST-320 | 日付の境界 | `staleDays` ちょうど / 期限の当日 / 期限の翌日 | 警告は超えた日から。違反にならない |
| TST-321 | 道具が無い | `gh` が無い / 浅い clone | accept は検査不能 (2)。docs-check は DS5 だけ検査不能で、他は動く |
| TST-322 | 並行 | 同じ id の accept を 2 つ同時に | 後の 1 本は拒否 (1)。履歴の行は 1 本 |
| TST-323 | 指紋の移動耐性 | proposed/ から accepted/2026/ へ移す (深さが 1 段増える)。本文に文書へのリンク・画像 `![](../img/a.png)`・コードへのリンク `[x](../../src/a.ts)`・docs/ の外の README へのリンクがある | リンクは新しい深さに書き換わるが、本文指紋は同じ。DS5・DS6 を通る |

## 3. トレーサビリティ

| 確認 | 結果 |
|---|---|
| 決定 → 規則 → テスト | 決定 1 → DS1・DS2 → 101・310〜312 / 決定 2 → コマンド・DS3 → 101〜104・313 / 決定 3 → DS4・DS5 → 301〜306・321・324〜326 / 決定 4 → DS3・DS6・DS7・DS9 → 301・307〜309・315 / 決定 5 → DS11 → 105・320 / 決定 6 → DS8・DS10 → 103・316・317 / 決定 7 → DS14 → 101〜103・107 / 決定 8 → DS13 → 108・318・319 / 決定 9 → DS9・DS12 → 109・112 / 決定 10 → 実装タスクの文面 (機械で確かめない) |
| 機械で確かめないもの | merge した人が人か (同じアカウント。ADR-0008 の限界 3) / `approvers` の編集 (`.igeta.json` は人の承認のパス) / 再提案が却下の理由を直したか / 根拠の PR の中身が、その決定を承認する意図だったか |
| いまの実装との差 | `ADR_STATUSES` に `rejected` はあるが遷移・履歴・フォルダ・根拠の検査は無い。索引は `Status・proposed・accepted` の列だけ。`DocGraphCheck` の ADR の置き場所 (`<年>/`) と `Role.ts` の adr の型は、状態のフォルダへ替える。全部未実装 |
| 要件定義書 02 §7 の差分 (実装 PR で `Role.ts`・ガイドと同時に直す) | adr の行を `person/decisions/{proposed/NNNN-slug.md, accepted/<year>/…, rejected/<year>/…, retired/<year>/…}` に。15 本の対象外の行に 4 フォルダを足す |

移行・差し込み口 (`GitHubPort`)・実装の割り方・フォルダ分けは [テスト仕様 12](./12-decision-migration.md)。
