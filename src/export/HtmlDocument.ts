// 章 HTML・目次・表紙情報から、自己完結 (ネットワーク不要) の 1 枚 HTML を組み立てる。
// Mermaid ランタイムは CDN を使わず、mermaid パッケージ同梱の dist/mermaid.min.js を
// そのままインライン <script> として埋め込む (読み込み・実行スクリプトは MermaidRuntime.ts
// に切り出してあり、checks/MermaidCheck.ts の早期検査と共有する)。

import type { ChapterHtml, TocEntry } from './ChapterRenderer.js';
import { MERMAID_RUNNER_SCRIPT, readMermaidRuntime } from './MermaidRuntime.js';
import { MERMAID_CONTAINER_MAX_HEIGHT_MM, MERMAID_PADDING_MM, MERMAID_SVG_MAX_HEIGHT_MM } from './PdfLayout.js';

export interface DocumentMeta {
  readonly title: string;
  readonly subtitle: string | null;
  /** null または空文字なら表紙に宛名の行を出さない */
  readonly recipient: string | null;
  readonly issuer: string;
  readonly version: string;
  readonly date: string;
}

export interface BuildHtmlOptions {
  readonly meta: DocumentMeta;
  readonly chapters: readonly ChapterHtml[];
  readonly toc: readonly TocEntry[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT_STACK =
  "'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', 'YuGothic', sans-serif";

function buildStyle(): string {
  return `
  html, body { margin: 0; padding: 0; }
  body { font-family: ${FONT_STACK}; font-size: 10.5pt; line-height: 1.7; color: #111; }
  h1, h2, h3, h4, h5, h6 { font-family: ${FONT_STACK}; break-after: avoid; page-break-after: avoid; }
  .cover { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 240mm; text-align: center; }
  .cover .title { font-size: 22pt; font-weight: 700; margin-bottom: 8mm; }
  .cover .subtitle { font-size: 14pt; color: #444; margin-bottom: 16mm; }
  .cover .meta { font-size: 11pt; color: #222; }
  .cover .meta div { margin: 2mm 0; }
  .toc { page-break-after: always; }
  .toc h2 { font-size: 16pt; margin-bottom: 6mm; }
  .toc ol { list-style: none; padding-left: 0; }
  .toc li { margin: 2mm 0; }
  .toc li.level-2 { margin-left: 8mm; font-size: 0.95em; color: #333; }
  .toc a { color: inherit; text-decoration: none; }
  .chapter { page-break-before: always; }
  /*
   * 表は本文幅を超えない。auto レイアウトのまま th/td に min-width を与えると、
   * 中身が短い列 (罫線のみで折り返す余地が無い CJK) が 1 文字幅まで潰れるのを防げる。
   * 列数が多く min-width の合計が本文幅を超えるときは、後段の fitTables() が
   * table-layout:fixed に切り替えて「表の幅 (本文幅に収まること) > 各列の min-width」を優先する。
   */
  table { border-collapse: collapse; width: 100%; max-width: 100%; margin: 4mm 0; table-layout: auto; }
  th, td { border: 1px solid #555; padding: 2mm 3mm; text-align: left; min-width: 4.5em; overflow-wrap: break-word; }
  tr, table { break-inside: avoid; page-break-inside: avoid; }
  pre, code { font-family: 'SFMono-Regular', Consolas, Menlo, monospace; }
  pre { background: #f5f5f5; padding: ${MERMAID_PADDING_MM}mm; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
  /*
   * 図は縦横どちらも 1 ページに収める。box-sizing:border-box で padding を高さ上限に含め、
   * svg 側は width:auto/height:auto + max-width/max-height で縦横比を保ったまま縮める。
   * overflow:hidden は縮小が効かない異常系のときに隣のページへ滲み出させないための保険。
   */
  pre.mermaid {
    background: none;
    text-align: center;
    break-inside: avoid;
    page-break-inside: avoid;
    box-sizing: border-box;
    max-height: ${MERMAID_CONTAINER_MAX_HEIGHT_MM}mm;
    overflow: hidden;
  }
  pre.mermaid svg {
    display: block;
    margin: 0 auto;
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: ${MERMAID_SVG_MAX_HEIGHT_MM}mm;
  }
  img { max-width: 100%; }
  a { color: #1a4fa3; }
  `;
}

function buildCover(meta: DocumentMeta): string {
  return `
  <section class="cover">
    <div class="title">${escapeHtml(meta.title)}</div>
    ${meta.subtitle !== null && meta.subtitle !== '' ? `<div class="subtitle">${escapeHtml(meta.subtitle)}</div>` : ''}
    <div class="meta">
      ${meta.recipient !== null && meta.recipient !== '' ? `<div>${escapeHtml(meta.recipient)}</div>` : ''}
      <div>${escapeHtml(meta.issuer)}</div>
      <div>version ${escapeHtml(meta.version)} / ${escapeHtml(meta.date)}</div>
    </div>
  </section>`;
}

function buildToc(toc: readonly TocEntry[]): string {
  const items = toc
    .map((entry) => `<li class="level-${entry.level}"><a href="#${entry.id}">${escapeHtml(entry.text)}</a></li>`)
    .join('\n');
  return `
  <section class="toc">
    <h2>目次</h2>
    <ol>
${items}
    </ol>
  </section>`;
}

/**
 * 表の幅を本文幅に収める。auto レイアウト (既定) のままだと、th/td の min-width の
 * 合計が本文幅を超える表 (列数が多い表) はその分だけ本文幅からはみ出す。
 * その場合だけ table-layout:fixed に切り替え、列を等分することで表を本文幅に収める
 * (= 表の幅を優先し、各列の min-width は妥協する)。document.body.clientWidth を本文幅の
 * 基準にするため、PdfRenderer.ts は PDF の印字幅と同じビューポート幅で読み込む。
 */
const TABLE_FIT_SCRIPT = `
(function () {
  var tables = document.querySelectorAll('table');
  var bodyWidth = document.body.clientWidth;
  for (var i = 0; i < tables.length; i++) {
    var table = tables[i];
    if (table.getBoundingClientRect().width > bodyWidth + 1) {
      table.style.tableLayout = 'fixed';
    }
  }
})();
`;

export function buildHtmlDocument(options: BuildHtmlOptions): string {
  const { meta, chapters, toc } = options;
  const mermaidJs = readMermaidRuntime();
  const chaptersHtml = chapters
    .map((chapter) => `<section id="${chapter.sectionId}" class="chapter">\n${chapter.html}\n</section>`)
    .join('\n');

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${escapeHtml(meta.title)}</title>
<style>${buildStyle()}</style>
</head>
<body>
${buildCover(meta)}
${buildToc(toc)}
${chaptersHtml}
<script>${TABLE_FIT_SCRIPT}</script>
<script>${mermaidJs}</script>
<script>${MERMAID_RUNNER_SCRIPT}</script>
</body>
</html>
`;
}
