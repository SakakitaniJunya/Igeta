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
