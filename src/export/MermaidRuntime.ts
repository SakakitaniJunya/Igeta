// mermaid をページ内で描画し、失敗を集めるための共有ロジック。
// PDF 出力 (HtmlDocument.ts の buildHtmlDocument → PdfRenderer.ts の renderPdf) と、
// 早期検査 (checks/MermaidCheck.ts の mermaid-check) の両方から使う。
// このファイルを切り出す前は HtmlDocument.ts と PdfRenderer.ts にそれぞれ同じ内容が
// 埋め込まれていた (05-coverage-and-learning.md §8 手順 4)。

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from 'playwright-core';

/** mermaid パッケージ同梱の UMD ビルドを読む。npm パッケージとして解決するため相対パス固定にしない。 */
export function readMermaidRuntime(): string {
  const require = createRequire(import.meta.url);
  const path = require.resolve('mermaid/dist/mermaid.min.js');
  return readFileSync(path, 'utf8');
}

/**
 * mermaid.render を図ごとに呼び、1 件でも失敗したら window.__mermaidErrors__ に積む。
 * すべて処理し終えたら window.__mermaidDone__ を true にする (Playwright 側がこれを待つ)。
 * 対象は `<pre class="mermaid" id="...">` 要素の textContent。
 */
export const MERMAID_RUNNER_SCRIPT = `
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

export interface MermaidRuntimeError {
  readonly id: string;
  readonly message: string;
}

/**
 * MERMAID_RUNNER_SCRIPT が `__mermaidDone__` を立てるまで待ち、`__mermaidErrors__` を返す。
 * 呼び出し側は先に MERMAID_RUNNER_SCRIPT (と mermaid ランタイム本体) を埋め込んだページを
 * goto しておくこと。
 */
export async function waitForMermaidRender(page: Page): Promise<readonly MermaidRuntimeError[]> {
  await page.waitForFunction(
    () => (globalThis as unknown as { __mermaidDone__?: boolean }).__mermaidDone__ === true,
    { timeout: 60_000 },
  );
  return page.evaluate<MermaidRuntimeError[]>(
    () => (globalThis as unknown as { __mermaidErrors__: MermaidRuntimeError[] }).__mermaidErrors__,
  );
}
