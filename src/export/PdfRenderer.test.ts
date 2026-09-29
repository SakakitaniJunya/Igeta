// node --test dist
// restrictToOwnHtml() が自分の HTML 以外への要求を実際に止めることを、
// net::ERR_BLOCKED_BY_CLIENT という専用のエラー理由で確認する
// (単に繋がらないだけの失敗と区別するため)。Chromium がある環境でだけ走る。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { findChromiumExecutable } from './Chromium.js';
import { restrictToOwnHtml } from './PdfRenderer.js';

const workspaces: string[] = [];

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('restrictToOwnHtml', () => {
  const executable = findChromiumExecutable();

  it(
    '自分の HTML 以外への要求 (外部 URL への img / fetch) を ERR_BLOCKED_BY_CLIENT で止める',
    { skip: executable === null ? 'Chromium キャッシュが見つからない (npx playwright install chromium で用意すると走る)' : false },
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'igeta-export-pdfrenderer-'));
      workspaces.push(dir);
      const htmlPath = join(dir, 'test.html');
      writeFileSync(
        htmlPath,
        [
          '<!doctype html><html><body>',
          '<img id="img" src="http://127.0.0.1:1/nope.png">',
          '<script>',
          '  window.__imgSettled__ = false;',
          "  document.getElementById('img').addEventListener('load', () => { window.__imgSettled__ = true; });",
          "  document.getElementById('img').addEventListener('error', () => { window.__imgSettled__ = true; });",
          '  window.__fetchSettled__ = false;',
          "  fetch('http://127.0.0.1:1/nope').then(",
          '    () => { window.__fetchSettled__ = true; },',
          '    () => { window.__fetchSettled__ = true; },',
          '  );',
          '</script>',
          '</body></html>',
        ].join('\n'),
      );

      const executablePath = findChromiumExecutable();
      assert.ok(executablePath !== null);
      const browser = await chromium.launch({ executablePath, headless: true });
      try {
        const page = await browser.newPage();
        const htmlUrl = `file://${htmlPath}`;
        const failures: { url: string; error: string | null }[] = [];
        page.on('requestfailed', (request) => {
          failures.push({ url: request.url(), error: request.failure()?.errorText ?? null });
        });

        await restrictToOwnHtml(page, htmlUrl);
        await page.goto(htmlUrl, { waitUntil: 'load' });
        await page.waitForFunction(
          () =>
            (globalThis as unknown as { __imgSettled__?: boolean }).__imgSettled__ === true &&
            (globalThis as unknown as { __fetchSettled__?: boolean }).__fetchSettled__ === true,
          { timeout: 10_000 },
        );

        const blockedUrls = failures
          .filter((f) => f.error !== null && f.error.includes('ERR_BLOCKED_BY_CLIENT'))
          .map((f) => f.url);
        assert.ok(
          blockedUrls.some((u) => u.includes('nope.png')),
          `img への外部要求が ERR_BLOCKED_BY_CLIENT で止まっていない: ${JSON.stringify(failures)}`,
        );
        assert.ok(
          blockedUrls.some((u) => u.endsWith('/nope')),
          `fetch への外部要求が ERR_BLOCKED_BY_CLIENT で止まっていない: ${JSON.stringify(failures)}`,
        );
      } finally {
        await browser.close();
      }
    },
  );
});
