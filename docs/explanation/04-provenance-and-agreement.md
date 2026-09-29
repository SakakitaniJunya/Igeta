---
id: provenance-and-agreement
title: 由来・鮮度・顧客との合意台帳の形
type: explanation
kind: explanation
status: active
canonical: true
owners: [product, eng]
created: 2026-09-30
depends_on: [audience-layers]
relates_to: []
---

# 由来・鮮度・顧客との合意台帳の形

> **TL;DR**: 由来は本文に書かず**sidecar ファイル** (`<派生物>.provenance.json`) に置く。鮮度は正本の
> 該当行・節の **SHA256 を再計算して比較**するだけで、保存した状態は信用しない (既存の
> `docs-graph --write`/`--check` と同じ考え方)。顧客との合意は `igeta export` が書く**追記のみの台帳**
> (`agreements.ledger.jsonl`)。再合意の判定規則は `.igeta.json` に持つ。
> - 由来は export の forbid/omitSections に一切触らない設計にした (§1)
> - moat は仕組みではなく**運用で溜めたルールと合意履行の実績**にしかない (§7、都合の悪い見立て込み)

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | [読み手別の層](./03-audience-layers.md) | — |
| 下流 | `templates/docs/client/__chapter__.md` / `.igeta.json` | — |

## 1. 由来 (provenance) の形 — 本文の外のどちらにするか

| 案 | 検討 |
|---|---|
| 本文内 `## 由来` 節 / 行コメント | 節単位にしかならず export の `omitSections` 変更 (PR #11、未 merge) が要る。行コメント (`<!-- src: ... -->`) は `AUTOGEN` 以外の HTML コメントが PDF にそのまま文字で出る既知不具合があり、`AUTOGEN` ブロックも行単位の範囲除去でしか効かず表の 1 行には差し込めない |
| **sidecar ファイル (採用)** | 行・節どちらの粒度も持てる。export の `manifest.chapters` に載らないので forbid/omitSections/`html:false` に一切触らずゼロ変更で済む。人が読むには 2 ファイルになるが、由来は AI/評価者の accept 対象であって人が素読みする対象ではない |

sidecar は派生物と同じディレクトリに `<basename>.provenance.json` として置く。例:

```json
{ "sourceDoc": "docs/client/02-reservation.md", "entries": [
  { "anchor": "1. 予約の受付 > table:1 > 予約の変更", "from": "reservation-flow/REQ-114",
    "fingerprint": "sha256:3b1e...c9", "capturedBy": "agent:eng-base", "capturedAt": "2026-09-28",
    "acceptedBy": "reviewer@example.com", "acceptedAt": "2026-09-29" }
] }
```

`from` は既存の修飾 ID (`<doc-id>/PREFIX-nnn`) をそのまま使う。**行 ID** (REQ/FN 等) は `collectRowDefinedTokens` (既存、`core/IdDefinitions.ts`) で定義行を取り、その行テキストを正規化して SHA256 する。**節** (機能ブリーフの `## 1. WHAT/WHY` 等) は既存の見出し抽出でセクション本文を取り、同じ方法で SHA256 する。`acceptedBy`/`acceptedAt` が無いエントリは「未承認」として扱う。`capturedBy` は書いた主体を書く (§2)。

## 2. 鮮度の検査

| 状態 | 判定 | 検査の扱い |
|---|---|---|
| pending | エントリはあるが `acceptedBy` が無い | 違反 (要確認・未承認) |
| stale | 承認済みだが、`from` の現在の指紋が保存値と違う | 違反 (要確認・陳腐化) |
| self-approved | `acceptedBy` が `capturedBy` と同じ | 違反 (作る主体と裁く主体を分ける) |
| ok | 承認済みで、`acceptedBy` ≠ `capturedBy` かつ指紋が一致 | 合格 |

検査は新設 `ProvenanceFreshnessCheck` → CLI `provenance-check` (`domain-drift`/`secret-scan` と同じ「別コマンド・既定で CI に無い」型)。書き込みは検査と分け、`ScaffoldCommand` と同型で `ProvenanceModule` → CLI `provenance capture`/`accept`:

- `igeta provenance capture <file> --anchor "<anchor>" --from <doc-id>/<token> --captured-by <name>` — 現在の `from` から指紋を計算し、エントリを作る/上書きする (`acceptedBy` は付けない)。`capturedBy` は AI agent なら `agent:<pack名>` の形、人なら git のメール等をそのまま書く規約にする
- `igeta provenance accept <file> [--anchor "<anchor>" | --all] --by <name>` — `--by` は必須 (省略しない。git の設定を共有する AI agent と人を区別できないため)。値が対象エントリの `capturedBy` と一致すれば `self-approved` として拒否し、一致しなければ指紋を保存値に上書きして `acceptedBy`/`acceptedAt` を記録する

## 3. 顧客との合意台帳

`docs/client/agreements.ledger.jsonl` (追記のみ、JSON Lines)。

```jsonl
{"event":"export","version":"1.2.0","date":"2026-09-30","manifest":"docs/client/deliverable.json","chapters":[{"file":"docs/client/02-reservation.md","sources":[{"from":"reservation-flow/REQ-114","fingerprint":"sha256:3b1e...c9"}]}]}
{"event":"approve","targetVersion":"1.2.0","approvedBy":"発注側の責任者","approvedAt":"2026-10-02"}
```

- `event:"export"` は `igeta export <manifest.json> --record-agreement` (既存 `ExportCommand` に 1 flag 追加) が成功時に追記する。章ごとに、その時点の由来先の指紋を全部埋め込む (sidecar の値をコピーする。台帳は sidecar とは別に自己完結させる — sidecar が後で書き換わっても、承認した版の記録は変わらない)
- `event:"approve"` は新設 `igeta agreement approve <version> --by <name>` (人が押す。取り消しにくい操作ではないが「顧客の合意」を主張する行為なので、発注側の責任者/裁く側だけが実行する運用にする)
- `igeta agreement-check` (新設 Check) は最新の approve が指す `export` エントリを読み、`sources` の `from` を今の正本で再計算し、`.igeta.json` の `reagreementRules` に当たるものを「再合意が要る変更」として一覧する

## 4. 設定ファイル `.igeta.json`

対象リポジトリの根に置く (`.igeta-version` と同じ階層)。**存在しなくても既定値で動く** (§6 の段階導入と同じ考え方)。CLI フラグは「どの設定ファイルを読むか」だけを上書きし (`--config <path>`)、規則の値そのものは CLI から個別に上書きしない (`decisionAttributionPatterns` が今 CLI から上書きできないのと同じ理由)。

```json
{ "reagreementRules": {
  "requirements": { "sections": ["*"] },
  "feature-brief": { "sections": ["2. ユーザーストーリー", "3. 対象外"] }
} }
```

v1 は **kind + 節単位**までで、列単位 (「この列だけ」) は持たない (§9 限界)。

## 5. CLI 一覧

| コマンド | 種別 | 追加・変更 | 終了コード |
|---|---|---|---|
| `template-check --require-audience-layers` | 検査 | 追加 (flag) | Ok / Violation / CannotCheck |
| `provenance-check` | 検査 (新設) | 追加 | Ok / Violation / CannotCheck |
| `agreement-check` | 検査 (新設) | 追加 | Ok / Violation / CannotCheck |
| `provenance capture` / `provenance accept` | 生成 (新設) | 追加 | Ok / CannotCheck |
| `agreement approve` | 生成 (新設) | 追加 | Ok / CannotCheck |
| `export --record-agreement` | 生成 (既存 flag 追加) | 変更 (PR #11 merge 後) | 既存の `export` の終了コードに従う |

## 6. 規模の試算

| 読み手 | 機能 35 件 | 機能 300 件 | 増える単位 |
|---|---|---|---|
| agent (正本) | 77 本・約 8,400 行 (全量) | 概算 660 本・約 72,000 行 (全量) | 総量は比例。1 タスクで読む量は修飾 ID で機能ブリーフ 1 枚 + 関連 REQ に絞るため増えない (約 150〜300 行) |
| developer | 地図 150 行 + 決定台帳 + ブリーフ 1 枚 150 行 | 全体地図 150 行 + 文脈の地図 150 行 + 決定台帳 + ブリーフ 1 枚 150 行 (2 段化、[読み手別の層](./03-audience-layers.md) §4) | 段を分けたぶん定数増だが、選ぶ対象は「文脈 6〜7→概算 20」→「文脈内のブリーフ数」の 2 段検索になり、300 枚から直接選ばせない |
| client | 約 10 章・650 行・PDF 25 頁 | 概算 20 章・1,300 行・PDF 50 頁 | 章の単位を**機能数ではなく業務コンテキスト数** (6〜7→概算 20) に固定するため、機能数に対して準線形未満に抑える |

## 7. 参入障壁の見立て

| 写せる | 写せない (moat の候補) |
|---|---|
| `audience` フィールドと既定値表 (単純な取り決め) | 案件ごとに溜まった「食い違いの規則」の実測ログ (§8 の初期規則は 1 件の実例からの起点でしかない) |
| 由来+指紋の仕組み (Doorstop の親指紋と同型、数百行で複製可能) | 顧客との合意台帳の再合意判定規則 (「判定の規則は運用からしか育たない」— 最初の規則が正しい保証は無い) |
| 検査コードそのもの (MIT で公開、誰でも clone できる) | 日本のウォーターフォール成果物の型 + 3 読み手 + 由来 + 鮮度 + forbid を**実際に統合して保守している運用**そのもの |

**都合の悪い見立て**: DITA/AsciiDoc/Sphinx + Doorstop + Sphinx-Needs/StrictDoc を組み合わせれば、技術力のあるチームは数週間で同等の骨格を再現できる可能性が高い。moat は個々の要素技術には無い。**やめる条件 (数えられる形)**:
- 由来+指紋: 実例の食い違い 4 件を再現実験し、事前 (評価ラウンド前) に捕まえられたのが 1 件以下ならやめる
- Mermaid 早期検査 (§8): 実例の図構文誤り 2 件を再現実験し、2 件とも事前に捕まえられなければ docs-check への統合をやめ、export 時点の検査に戻す
- 合意台帳の再合意規則: 最初の 3 案件で再合意フラグが 1 回も正しく機能しない (全部 noise か全部漏れ) なら、既定の規則を空にして凍結する (機構自体はやめない)

## 8. 初期の食い違いの規則・段階導入の順

汎化した規則は Igeta 本体、案件ごとの記録は案件の repo に置く (`.igeta.json`)。初期 3 規則は実例から起こす。

1. **`feature-brief` の `depends_on: []` 既定値を直す** (`ROOT_KINDS` 対応漏れ、300 件規模で階層検査が壊れる前提修正。既定値は自分の属する `context-map` の id にする)
2. **決定 ID 正規表現の誤検出を直す** (`DEC-\d{3}` が日付入り ID `DEC-YYYYMMDD-NN` に部分一致する既存不具合。①の隣で一緒に直す前提修正。適用手順は §10)
3. **`client-chapter`/`context-map` kind を追加** (`ARC42_BY_KIND` に null、`NON_ARC42_KINDS` に追加。既存の登録パターンのまま増やす)
4. **`template-check --require-audience-layers`** (audience の値検証・`client-chapter`/`context-map` の構造検査)
5. **由来 sidecar (`provenance capture`/`accept`) + `provenance-check`**。ここで規則 1 「派生物が『確定』と書いているのに正本が未決」を実装 (`from` の正本 status が `FINAL_STATUSES` 外なのに派生物側が確定を主張している場合を落とす)
6. **Mermaid の早期検査**: export (`renderChapters`) の描画チェックを `src/core/MermaidRender.ts` に切り出し、`docs-check`/新設チェックの双方から呼べるようにする。規則 3「Mermaid が描画できない」を評価より前に倒す
7. **合意台帳 (`export --record-agreement`/`agreement approve`/`agreement-check`)**。規則 2 「派生物の数値が正本と違う」は accept 前の「pending は常に違反」ゲートで運用に押し込む (§9 の限界を参照。機械では値の正しさまでは検証しない)

手順 3〜7 の新設検査・コマンドは**すべて新規ファイル**に置き、既存ファイルの変更は `cli.ts` へのコマンド登録行と kind 登録 2 か所 (`ARC42_BY_KIND`/`NON_ARC42_KINDS`) だけにする。PR #13 (`review-sheet --diff`/`analyze`/`fix-ids`、試験中) とぶつかるのはその数行だけなので、**PR #13 の完了・撤回を待たずに着手できる**。export (PR #11) は director が main に合わせ直す作業で、手順 7 の `export --record-agreement` の追加だけをその後に回す。

## 9. 限界と人が判断する地点

| 地点 | 誰が判断するか | 機械にできないこと |
|---|---|---|
| accept (§2) | AI または評価者 (人) | `self-approved` (`capturedBy`=`acceptedBy`) は機械で防げるが、承認は「押した」ことしか記録しない。値の正しさを確認せずに別人格が押した accept を機械は見抜けない (実例 3 の再発を完全には防げない) |
| 合意の承認 (§3) / 再合意の要否判定 (§4) | 承認者・案件の裁く側 (`.igeta.json` の規則) | 「顧客が合意した」事実自体は記録の外 (口頭・メール等) にあり、台帳は残すだけで成立は保証しない。再合意は v1 で kind + 節単位まで (director 決定、列単位は持たない)。既定規則は 1 案件の実例からの起点 (§7 のやめる条件で見直す) |

## 10. 実案件への適用手順 (案件名は出さない)

1. Igeta 側: PR #12 (人間レビュー層) 以降を含む新タグを切る (現行タグ `v0.2.1` は PR #12 を含まない)
2. 案件側: 古い `.mjs` の写しを削除し、`package.json` の `devDependencies` を新タグへの npm git 依存に切り替える。`igeta check` (`.igeta-version` 比較) で追従を確認する
3. `feature-brief` の `depends_on: []` 既定値の修正・決定 ID 正規表現の修正 (§8-1・§8-2) を先に適用する。日付入り ID (`DEC-YYYYMMDD-NN`) を使う案件は、決定台帳に 3 桁 ID を採番し直し、旧 ID は表の「原文」列に残す (ID 自体は捨てない)
4. `client-chapter`/`context-map` テンプレを追加し、既存の顧客向け章・地図 (もしあれば) を移行する。この時点では `--require-audience-layers` は付けない (既定 OFF)
5. 由来 sidecar を**新規に書く章からだけ**作り始め (既存章は「由来なし」のまま残す)、`provenance-check` を CI に**追加はするが exit code を見ない** (warning 運用) 期間を置いて未由来化の章の残数を可視化してから block に切り替える
6. 合意台帳は次回の提出物から開始する。過去の提出物を遡って記録しない (実測できないものを捏造しない)
