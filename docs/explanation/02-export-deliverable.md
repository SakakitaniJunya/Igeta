---
id: export-deliverable
title: igeta export — 提出用 PDF 出力基盤
type: explanation
kind: explanation
status: active
canonical: true
owners: [eng]
created: 2026-09-29
depends_on: []
relates_to: [docs-index]
---

# igeta export — 提出用 PDF 出力基盤

> **TL;DR**: `igeta export` は、章ごとに分けた Markdown を先方提出用の **PDF 1 冊**にまとめる CLI コマンド。
> - manifest (`deliverable.json`) が章の順序・表紙情報・出力先を持つ。**正 (SoT) は章 Markdown 側**で、PDF は生成物
> - `forbid` に一致する語 (社内 ID など) が 1 件でもあれば **PDF を 1 つも書かずに落ちる**
> - Mermaid 図はネットワーク無しでその場で描画する。描画に失敗した図があれば同様に落ちる

## 関連

| 区分 | 文書 | 対応 ID |
|---|---|---|
| 上流 (depends_on) | `templates/docs/delivery/` (manifest と章の雛形) | — |
| 下流 | `src/export/` (実装) / `src/cli/commands/ExportCommand.ts` | — |

## 1. なぜ作ったか

受託開発の設計書は、社内では章ごとの Markdown (Igeta の設計書体系) で管理していても、先方への提出物は
「1 冊の PDF」を求められることが多い。Markdown を手でコピーして体裁を整える作業は毎回発生し、社内 ID
(決定番号・要件番号など) を消し忘れて提出してしまう事故も起きる。`export` はこの変換を機械化し、
**社内 ID の混入を機械で止める**ことを主目的にした。

## 2. deliverable.json の項目

| 項目 | 必須 | 意味 |
|---|---|---|
| `title` | ✓ | 表紙の題名。PDF のヘッダにも出る |
| `subtitle` | — | 表紙の副題。省略可 |
| `recipient` | — | 表紙に**そのまま**出す宛先。「様」「御中」は自動で付けない (`〇〇株式会社 御中` のように書く)。省略可。省略・空文字なら表紙に宛名の行そのものを出さない |
| `issuer` | ✓ | 表紙に出す発行者名 |
| `version` | ✓ | 表紙に出すバージョン表記 |
| `date` | ✓ | 表紙に出す日付表記 |
| `chapters` | ✓ | 束ねる章 Markdown の相対パス配列。**この順に PDF へ並ぶ** |
| `forbid` | — | 本文に出てはいけない語の正規表現配列 (§3) |
| `omitSections` | — | 出力から除く H2 節の見出し文字列の配列 (§3.1)。既定は `["関連"]` |
| `output` | ✓ | 出力先。`.pdf` で終わる相対パス。同じ場所に `.html` も書く |

パスはすべて `deliverable.json` のあるディレクトリを基準に解決する。必須項目の欠落・章ファイルの不在は
1 件も見逃さず全件まとめてエラーにする (直すたびに 1 回ずつ再実行させない)。`chapters` / `output` が
`../` や絶対パスで manifest の外を指していたら、章ファイルの有無に関わらずエラーにする
(manifest の外のファイルを読んだり、manifest の外へ書き出したりしない)。

## 3. forbid — 社内 ID の混入防止

`forbid` は正規表現の配列。各章の本文 (frontmatter・`<!-- AUTOGEN -->` 区間・§3.1 で除いた節を除いた
部分) に対して全件検査し、1 件でも一致すれば **どのファイルも書かずに** `ファイル:行:語` を全件出して
非 0 終了する。決定番号・要件番号などの社内 ID 体系を forbid に列挙しておけば、社内向け Markdown を
そのまま元に書いても提出物に漏れない。

### 3.1 omitSections — 社内向け節の除去

社内の設計書体系 (`templates/docs/*`) は各文書に `## 関連` (上流/下流の表) を必須で持つ。この節は
社内の文書管理事情そのものなので、先方提出物にはそのまま出したくない。`omitSections` に挙げた
**H2 見出しの文字列が一致した節**は、次の同じ階層以上 (h1/h2) の見出しか文書末尾までを丸ごと除き、
**forbid 検査より前に**取り除く。除いた節の中身は forbid にも引っかからないし、PDF にも出ない。

- 既定値は `["関連"]`。`templates/docs/delivery/__chapter__.md` の `## 関連` 節は既定でそのまま除かれる
- 明示すれば上書きできる。`[]` を渡すと何も除かない

### 3.2 AUTOGEN が閉じられていない章

`<!-- AUTOGEN:...:start -->` を書いたら、同じ章の中に対応する `:end` が必ず要る。章の終わりまで
閉じられなければ、それ以降の本文を黙って捨てず、ファイル名と開始行を出してエラーで止める
(閉じ忘れたまま本文が欠けた提出物を作らないため)。

## 4. 出力の見え方

1. **表紙**: `title` / `subtitle` / `recipient` / `issuer` / `version` / `date`
2. **目次**: 各章の `#`(h1) / `##`(h2) 見出しから自動生成。章の並びは `chapters` の順
3. **本文**: 章ごとに改ページ。表は罫線付きで、改ページで行が割れないようにする。列 (th/td) には
   最小幅 (4.5em、全角 4〜5 文字分) があり、中身が短い列が 1 文字幅まで潰れない。列数が多く
   最小幅の合計が本文幅を超える表は、最小幅より表の幅 (本文幅に収まること) を優先する
4. **Mermaid 図**: ` ```mermaid ` フェンスをその場で図として描画する (CDN 不使用。描画失敗は非 0 終了)。
   縦横どちらに長い図でも縦横比を保ったまま 1 ページに収まる大きさへ自動で縮める (隣のページに跨がせない)
5. **章間リンク**: `[x](03-flows.md#anchor)` は PDF 内アンカーに書き換わる。`chapters` に無いファイルや
   外部 URL へのリンクは**リンクを外して文字だけ残し**、標準エラーに警告を出す (提出物に確認できないリンクを残さないため)
6. **ヘッダ / フッタ**: ヘッダに文書名、フッタにページ番号 (`1 / 12` 形式)
7. **フォント**: Hiragino Sans → Noto Sans JP → Yu Gothic の順に解決する日本語フォント指定

## 5. 使い方

```bash
igeta export path/to/deliverable.json          # PDF まで生成する。Chromium が要る
igeta export path/to/deliverable.json --html-only  # HTML だけ生成する。Chromium 不要
```

雛形は `templates/docs/delivery/deliverable.json` と `templates/docs/delivery/__chapter__.md`
(frontmatter `kind: delivery-chapter`。arc42 章を持たない対外文書で、必須節は「関連」のみ。
`proposal` / `guide` と同列)。

## 6. 安全対策

章 Markdown は社内原稿がそのまま先方提出物になる。原稿に埋め込まれた内容が意図しない形で動いたり、
外部へ通信したりしないよう、次を徹底している。

- 章 Markdown 中の生 HTML (`<script>` 等) はタグとして通さず、エスケープした文字として出す
  (markdown-it を `html: false` で使う)
- PDF 化に使うブラウザページは、自分の HTML ファイル 1 本以外への通信を一切許さない。
  章に外部 URL への画像・リンクが残っていても、読み込みや通信は `page.route()` で止める
  (Mermaid はランタイムをインライン埋め込みしているため影響しない)

## 7. 制約

- Chromium は `~/Library/Caches/ms-playwright/chromium-*` 等、**既に Playwright が取得済みのもの**を探して使う。
  見つからなければ `npx playwright install chromium` を案内して非 0 終了する (export 自体はブラウザを取得しない)
- 章 Markdown 内の画像 (`![]()`) の埋め込みは対象外。Mermaid 図以外の図は事前に画像化して章側で埋め込む運用を想定する
