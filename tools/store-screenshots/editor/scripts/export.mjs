#!/usr/bin/env node
// 合成: render ページを Playwright で開き、ストアサイズに clip して PNG 出力。
// 出力先: store/screenshots/<asc-locale>/<NN>.png （ composed ＝公開するもの）
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
// playwright（無ければテスト用の @playwright/test）のどちらかを使う
const { chromium } = await import('playwright').catch(() => import('@playwright/test'));
import { serveRepo, REPO_ROOT } from './serve.mjs';
import { SLIDES } from '../src/defaults.mjs';
import { LOCALES, DEVICES } from '../../scripts/locales.mjs';

const only = process.argv[2]; // 例: "ja" でロケール絞り込み

const { server, port } = await serveRepo();
const outDir = join(REPO_ROOT, 'store', 'screenshots');
const browser = await chromium.launch();
let failures = 0;

try {
  for (const loc of LOCALES) {
    if (only && loc.editor !== only && loc.asc !== only) continue;
    for (const [deviceId, dev] of Object.entries(DEVICES)) {
      // clip は viewport 外を撮れないので、出力解像度をそのまま viewport にする
      const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height } });
      const page = await ctx.newPage();
      for (let i = 0; i < SLIDES.length; i++) {
        const url = `http://127.0.0.1:${port}/store-screenshots/render.html?slide=${i}&locale=${loc.editor}&store=${dev.store}&device=${deviceId}`;
        const name = `${String(i + 1).padStart(2, '0')}.png`;
        const dir = join(outDir, dev.store === 'apple' ? loc.asc : `${loc.asc}-${deviceId}`);
        mkdirSync(dir, { recursive: true });
        const filepath = join(dir, name);
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
          const err = await page.evaluate(() => document.documentElement.dataset.renderError);
          if (err) throw new Error(err);
          await page.waitForSelector('[data-render-ready="1"]', { timeout: 15000 });
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({ path: filepath, clip: { x: 0, y: 0, width: dev.width, height: dev.height } });
          console.log(`export ${dev.store}/${deviceId}/${loc.editor}/${name}`);
        } catch (e) {
          failures++;
          console.error(`FAIL ${deviceId}/${loc.editor}/${name}: ${e.message}`);
        }
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
process.exitCode = failures ? 1 : 0;
