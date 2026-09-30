// 自己完結 HTML を Chromium (playwright-core) で A4 PDF 化する。
// Mermaid の描画はページ内スクリプトが非同期に行うため、完了フラグを待ってから
// エラーの有無を確認する。1 件でも描画失敗があれば PDF を書かずに落とす
// (生の mermaid コードをそのまま出すサイレント縮退を避けるため)。

import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import type { MermaidBlock } from './ChapterRenderer.js';
import { findChromiumExecutable, PLAYWRIGHT_INSTALL_HINT } from './Chromium.js';
import { waitForMermaidRender } from './MermaidRuntime.js';
import {
  PDF_MARGIN_BOTTOM_MM,
  PDF_MARGIN_LEFT_MM,
  PDF_MARGIN_RIGHT_MM,
  PDF_MARGIN_TOP_MM,
  PRINTABLE_WIDTH_MM,
  mmToPx,
} from './PdfLayout.js';

export class ChromiumNotFoundError extends Error {
  constructor() {
    super(`Chromium が見つからない。${PLAYWRIGHT_INSTALL_HINT}`);
  }
}

export class MermaidRenderError extends Error {
  readonly messages: readonly string[];

  constructor(messages: readonly string[]) {
    super(messages.join('\n'));
    this.messages = messages;
  }
}

export interface PdfRenderOptions {
  readonly htmlPath: string;
  readonly pdfPath: string;
  readonly title: string;
  readonly mermaidBlocks: readonly MermaidBlock[];
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * ページの通信先を自分の HTML ファイル 1 本だけに絞る。章 Markdown は社内原稿がそのまま
 * HTML になるため、外部への通信手段を一切与えない (自己完結 HTML の前提を守り、意図しない
 * 外部リクエスト・情報送信を作らないため)。htmlUrl 以外への要求は http(s) 含め全て止める。
 * renderPdf() から使う。テストからも直接呼べるよう分離してある。
 */
export async function restrictToOwnHtml(page: Page, htmlUrl: string): Promise<void> {
  await page.route('**/*', (route) => {
    if (route.request().url() === htmlUrl) {
      void route.continue();
    } else {
      void route.abort('blockedbyclient');
    }
  });
}

export async function renderPdf(options: PdfRenderOptions): Promise<void> {
  const executablePath = findChromiumExecutable();
  if (executablePath === null) throw new ChromiumNotFoundError();

  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    const htmlUrl = `file://${options.htmlPath}`;
    await restrictToOwnHtml(page, htmlUrl);
    // ページ内スクリプト (表の自動幅調整など) が「印字できる幅」を基準に判断できるよう、
    // PDF の本文幅と同じビューポート幅で読み込む。page.pdf() 自体は用紙サイズで独立に
    // レイアウトし直すが、スクリプトの一度きりの判定はこの時点の幅を見るため合わせておく。
    await page.setViewportSize({ width: mmToPx(PRINTABLE_WIDTH_MM), height: 2000 });
    await page.goto(htmlUrl, { waitUntil: 'load' });
    const mermaidErrors = await waitForMermaidRender(page);
    if (mermaidErrors.length > 0) {
      const byId = new Map(options.mermaidBlocks.map((b) => [b.id, b.chapterRelPath]));
      const messages = mermaidErrors.map((error) => {
        const chapter = byId.get(error.id) ?? '(不明な章)';
        return `${chapter}: mermaid 図 (${error.id}) の描画に失敗: ${error.message}`;
      });
      throw new MermaidRenderError(messages);
    }

    await page.pdf({
      path: options.pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: `${PDF_MARGIN_TOP_MM}mm`,
        bottom: `${PDF_MARGIN_BOTTOM_MM}mm`,
        left: `${PDF_MARGIN_LEFT_MM}mm`,
        right: `${PDF_MARGIN_RIGHT_MM}mm`,
      },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:8px; width:100%; text-align:center; color:#666; padding-top:6mm;">${escapeHtml(options.title)}</div>`,
      footerTemplate:
        '<div style="font-size:8px; width:100%; text-align:center; color:#666;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
  } finally {
    await browser.close();
  }
}
