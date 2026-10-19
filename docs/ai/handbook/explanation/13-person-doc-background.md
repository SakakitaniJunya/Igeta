---
id: person-doc-background
title: 解説 — 人の文書の背景と作り方 (要件 01・02・解決戦略から移した行と経緯)
type: explanation
kind: explanation
status: active
canonical: false
owners: [eng]
created: 2026-10-18
depends_on: [docs-model-strategy, audience-directories, requirements]
relates_to: [folder-placement]
---

# 解説 — 人の文書の背景と作り方

> **TL;DR**: `person/` の要件・解決戦略から、作り方だけの行と経緯をここへ移した。決まりは person の行に残し、ここは行の ID を引く。

## 1. 作り方の行 (要件 01・02 の前提から移した)

| 新 ID | 前提 | 未確認 / 確認済 | 崩れた場合の影響 | 元の行 |
|---|---|---|---|---|
| BG-006 | (崩れた) 当初は「読み手 3 種と kind→読み手対応は確定版で再設計しない」としていた。ADR-0001 v4 で「確定させる人」で再設計した | 確認済 (崩れた) | 対応表の再設計 — 実施済み | requirements/REQ-301 |
| BG-007 | 消費 repo の docs/README.md は `templates/docs/README.md` の系譜で、索引は `<!-- AUTOGEN:dir-index -->` 区間に生成され手書き禁止 | 確認済 | 入口 3 行を AUTOGEN 区間外に置く設計が別途要る | requirements/REQ-302 |
| BG-008 | kind の解決は frontmatter 優先・置き場所由来で必ず判定できる (未登録 kind は template-check が落とす) | 確認済 | kind の無い文書の扱いを別途決める必要がある (要件 02 で「移行のときに一覧で止める」に決めた) | requirements/REQ-303 |
| BG-001 | (崩れた) 当初は「kind → 読み手の対応は確定済みで再設計しない」としていた。人が決める内容が AI 側にあると分かり、ADR-0001 v4 で「確定させる人」で再設計した | 確認済 (崩れた) | 対応表の再設計 — 実施済み | audience-directories/REQ-301 |
| BG-002 | 文書の発見・分類は frontmatter (kind・arc42・depends_on) から行い、パスに依存しない | 確認済 (コード調査) | 移動の影響の見積もりが変わる | audience-directories/REQ-302 |
| BG-003 | 移動で壊れるのは相対パスの参照だけ。depends_on・relates_to・由来の `from` は id で解決する。ただし本文のリンクの書き換えは由来の指紋を変える (ADR-0007 で対処) | 確認済 (コード調査) | 移行で由来が一斉に要確認になる | audience-directories/REQ-303 |
| BG-004 | kind の推論 (`kindFromPath`) はディレクトリの完全一致。まとまりのフォルダには、まとまりの 1 段だけワイルドカードにしたパスの型が要る | 確認済 | 置き場所の検査が誤判定する | audience-directories/REQ-304 |
| BG-005 | 新旧の構成の repo が移行期間中に併存する | 確認済 | audience-directories/REQ-106 が不要になる | audience-directories/REQ-305 |

## 2. 当初の論点と確定 (要件 02 §6 から移した経緯)

| # | 論点 | 確定内容 | ADR |
|---|---|---|---|
| 1 | 「共通」の置き場所 | 作らない。確定させる人で 3 つに分ける (`common/` は v3 で撤回) | ADR-0001 |
| 2 | ディレクトリの名前 | `person`・`ai`・`client` (小文字)。AI の入口は repo 直下の `AGENTS.md` | ADR-0001 |
| 3 | 移行手段の形 | `igeta docs-migrate` が適用まで行う。移行は「移す」と「書き直す」の 2 段を 1 本の PR で | ADR-0003 |
| 4 | 旧い構成の検出の強さ | 警告 → 次のメジャー版で違反。フラグは置かない | ADR-0005 |
| 5 | docs/ 直下の固定ファイル | 生成索引の 2 本だけ。地図は `person/design/shared/00-map.md`、決定台帳は `person/decisions/01-decisions.md` | ADR-0004 |
| 6 | ディレクトリの中の構造 | まとまりごとのフォルダ。日付の記録は年。1 フォルダ 15 本で違反 | ADR-0004 |
| 7 | Igeta 自身の移行 | 行う。Igeta 自身 → 利用 repo 2 つの順 | ADR-0003 |

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [要件定義書 02](../../../person/requirements/02-audience-directories.md) / [解決戦略](../../../person/design/shared/02-solution-strategy.md) | audience-directories/REQ-301〜305 |
| 下流 | 要件 01・02 と解決戦略から移した行の受け皿 | BG-001〜008 |

## 3. 設計書とは何か (解決戦略 §0 から移した)

コードや OpenAPI・`schema.prisma` から機械的に導けることは手で書かない。設計書が持つのは、コードと契約には
存在しない 4 つだけ: **意図**・**決定**・**境界の約束**・**人との合意**。どれにも当たらない記述は書かない。

## 4. 参入障壁と組織的な決定 (解決戦略 §5 から移した)

| 写せる | 写せない |
|---|---|
| フォルダ名・検査のコード (公開) | 「どの kind のどの節を人に倒すか」の判断。実案件の評価の反省から積む |
| ADR の書式 | 食い違いの学習ループの実測ログ (05) と、`Role.ts` に積む誤判定の修正の履歴 |

本書と ADR 群が確定した後の作業: 文書体系ガイドの改訂、雛形の再編 (ADR-0010)、
新設の検査と `igeta docs-migrate` の実装、Igeta 自身の移行 (ADR-0003)。

## 6. 要件 01・02 の長い行から移した全文 (ID は修飾 ID で引く)

長い行は person に短く残し、元の行の全文をここに置く (ADR-0003 決定 5)。

- requirements の元の行: requirements/REQ-001 | docs を開いた人・AI が、その文書が顧客・開発者・AI の誰向けかを、文書体系の知識が無くても即判別できる | 読み手 3 種と kind→読み手対応は設計確定済みで層の実体 (まとまりの地図・約束・提出物の章) もあるが、索引・入口・ガイドのどこにも読み手の表示が無い。対応表は 解説 03 §3 (ai 側) にだけあり、docs を開いた人からは見えない | requirements/REQ-101〜104 をすべて満たす | 読み手 3 種・入口の構成・kind→読み手対応: explanation/03 §3。「即判別」の定量目標 (秒数・操作数) は**未整備**で、構造的受入条件で代替する | 仮
- requirements の元の行: requirements/REQ-002 | 細粒度に分かれた正本文書群を、読み手 (顧客 / 開発者 / AI) が「現時点の全体像」として 1 本の物語で読める | 文書は kind × context × id の小品群と depends_on の木で機械には強いが、索引 (dir-index) は地図であって物語ではない。読み手向けに全体を 1 本の叙述として読む生成物が無い | requirements/REQ-405 の再検討条件を満たした版で、読み手別の生成物語 1 本が depends_on の木と kind→読み手対応から生成される (要件化は次段) | Hora Kit (Open Reach Tech) 公開記事との比較 (2026-09-06)。同記事の spec.md が版ごとの物語を持つのに対し、本リポジトリは索引のみ | 仮
- requirements の元の行: requirements/REQ-101 | Event | 索引生成 (dir-index) が走ったとき、システムは各文書を確定させる人 (人 / AI / 顧客) を frontmatter `kind` から機械判定し、生成索引の当該文書の行に表示しなければならない | requirements/REQ-001 | 利用 repo で索引を再生成すると、kind を持つ全文書の行に区分が出る。kind を直せば次回生成で表示が変わる。kind を持たない文書は移行のときに一覧で止める (audience-directories/REQ-103) | 仮
- requirements の元の行: requirements/REQ-103 | Ubiquitous | 利用 repo の docs/README.md は「入口」として 3 行を持たなければならない。人 → `person/` を確定前に全部読む / AI → `AGENTS.md` から `person/` と `ai/` / 顧客 → `client/` の提出物 | requirements/REQ-001 | 新しく起こした利用 repo の docs/README.md に 3 行が含まれ、各行が実在するフォルダを指す。入口の文言は AUTOGEN 索引区間の外にあり、索引の再生成で消えない | 仮
- requirements の元の行: requirements/REQ-405 | 読み手別の「生成物語」— depends_on の木と kind→読み手対応から、読み手ごとの「現時点の全体像」文書 1 本を生成する機能 | 本版は読み手の「表示」(requirements/REQ-101〜104) に絞る。生成は正本の機械判定と入口整備が消費 repo に効いてから意味を持つ。作業中の実装に同梱しない | requirements/REQ-101〜104 が消費 repo に効き、次の版の要件として起案するとき (requirements/REQ-002 の受入として扱う) | 仮
- audience-directories の元の行: > **TL;DR**: docs/ を開いた人が、どれが人の読んで決める文書で、どれが AI の使う文書かを、フォルダだけで判別できない、を解く。docs/ 直下を、確定させる人ごとのディレクトリ (`person`/`ai`/`client`) に分け、kind → 置き場所の対応を正本 1 つに置き、
- audience-directories の元の行: > 置き場所の違反を検査で落とす。人の側の文書は、人が全部読んで決められる型と量に保つ
- audience-directories の元の行: | audience-directories/REQ-001 | docs/ を開いた人が、文書を 1 本も開く前に、フォルダだけで「人が読んで決める文書」と「AI が使う文書」と「顧客に渡す文書」を判別できる | v0.4.0 の読み手の表示は索引を経由したときだけ見える。フォルダは文書の種類で分かれていて、人が決める業務の決まりや画面が AI 側の場所にある | audience-directories/REQ-101〜106 をすべて満たす | CEO 指摘 (原文): 「どれが人間が読むもので、AIがどれかわかりません」「フォルダで大きく三つに分けちゃえばいいのに。docs」 | 仮 |
- audience-directories の元の行: | audience-directories/REQ-002 | 人が、自分の決める文書を 1 つのフォルダから全部たどれ、全部読める量に収まっている | 人の決める内容と作り方が 1 本に混ざり、基本設計をそのまま人の側へ移すと約 31 万字で読みきれない | `person/` の文書が ADR-0002 の型と量の条件を満たす | CEO 指摘 (2026-10-02): 「読みきれるボリュームなの？」ほか | 仮 |
- audience-directories の元の行: | audience-directories/REQ-105 | Event | 旧い構成の repo を移行するとき、システムは文書の移動と相対パスの書き換えを適用まで機械的に行わなければならない | audience-directories/REQ-002 | 移す段の完了条件 (リンク・置き場所・索引・由来と合意の状態・文書の集合) を満たし、残る違反が書き直す段の作業の列として出る。書き直す段の後に全検査が通る (ADR-0003・ADR-0006) | 仮 |
- audience-directories の元の行: | audience-directories/REQ-107 | Ubiquitous | システムは、§8 に挙げた kind の人の文書に、その kind の許す図種の Mermaid の図を、TL;DR の次の節 (最初の表より前) に 1 枚以上持たせなければならない | audience-directories/REQ-003 | §8 の kind の文書で、図が無い・空・別図種・閉じていない・冒頭域の外のどれかなら検査が落ちる。雛形 16 本が自分の検査を通る (ADR-0011、テスト仕様 08) | 仮 |
