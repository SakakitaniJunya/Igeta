// 章 HTML・目次・表紙情報から、自己完結 (ネットワーク不要) の 1 枚 HTML を組み立てる。
// Mermaid ランタイムは CDN を使わず、mermaid パッケージ同梱の dist/mermaid.min.js を
// そのままインライン <script> として埋め込む。

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { ChapterHtml, TocEntry } from './ChapterRenderer.js';

export interface DocumentMeta {
  readonly title: string;
  readonly subtitle: string | null;
  readonly recipient: string;
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

/** mermaid パッケージ同梱の UMD ビルドを読む。npm パッケージとして解決するため相対パス固定にしない。 */
function readMermaidRuntime(): string {
  const require = createRequire(import.meta.url);
  const path = require.resolve('mermaid/dist/mermaid.min.js');
  return readFileSync(path, 'utf8');
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
  table { border-collapse: collapse; width: 100%; margin: 4mm 0; }
  th, td { border: 1px solid #555; padding: 2mm 3mm; text-align: left; }
  tr, table { break-inside: avoid; page-break-inside: avoid; }
  pre, code { font-family: 'SFMono-Regular', Consolas, Menlo, monospace; }
  pre { background: #f5f5f5; padding: 3mm; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
  pre.mermaid { background: none; text-align: center; break-inside: avoid; page-break-inside: avoid; }
  pre.mermaid svg { max-width: 100%; }
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
      <div>${escapeHtml(meta.recipient)}</div>
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
 * mermaid.render を図ごとに呼び、1 件でも失敗したら window.__mermaidErrors__ に積む。
 * すべて処理し終えたら window.__mermaidDone__ を true にする (Playwright 側がこれを待つ)。
 */
const MERMAID_RUNNER_SCRIPT = `
window.__mermaidDone__ = false;
window.__mermaidErrors__ = [];
(async () => {
  try {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    const nodes = document.querySelectorAll('pre.mermaid');
    for (const el of nodes) {
      const code = el.textContent ?? '';
      try {
        const { svg } = await mermaid.render(el.id + '-svg', code);
        el.innerHTML = svg;
      } catch (error) {
        window.__mermaidErrors__.push({ id: el.id, message: String(error && error.message ? error.message : error) });
      }
    }
  } finally {
    window.__mermaidDone__ = true;
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
<script>${mermaidJs}</script>
<script>${MERMAID_RUNNER_SCRIPT}</script>
</body>
</html>
`;
}
