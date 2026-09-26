#!/usr/bin/env node
// 崩れ検査。レンダラが置いた目印 (data-slide-caption / data-slide-device) を
// DOM から実測する。検査側でレイアウトを再計算しない。
// 端末の中身が空でも成立するので、撮影を待たずに文言変更の検査ができる。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
// playwright（無ければテスト用の @playwright/test）のどちらかを使う
const { chromium } = await import('playwright').catch(() => import('@playwright/test'));
import { serveRepo, REPO_ROOT } from './serve.mjs';
import { SLIDES } from '../src/defaults.mjs';
import { LOCALES, DEVICES } from '../../scripts/locales.mjs';

const BAND_FRACTION = 0.04; // 端末直上に必要なクリアバンド（キャンバス高さ比）
const PIXEL_TOLERANCE = 0.02; // バンド内に許容する「本文色」ピクセル率

const { server, port } = await serveRepo();
const browser = await chromium.launch();
const violations = [];

try {
  for (const loc of LOCALES) {
    for (const [deviceId, dev] of Object.entries(DEVICES)) {
      const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height } });
      const page = await ctx.newPage();
      for (let i = 0; i < SLIDES.length; i++) {
        const tag = `${dev.store}/${deviceId}/${loc.editor}/${String(i + 1).padStart(2, '0')}`;
        const url = `http://127.0.0.1:${port}/store-screenshots/render.html?slide=${i}&locale=${loc.editor}&store=${dev.store}&device=${deviceId}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForSelector('[data-render-ready="1"]', { timeout: 15000 });

        const m = await page.evaluate(() => {
          const root = document.querySelector('.slide');
          const caption = root.querySelector('[data-slide-caption]');
          const deviceEl = root.querySelector('[data-slide-device]');
          const c = caption.getBoundingClientRect();
          const d = deviceEl.getBoundingClientRect();
          const r = root.getBoundingClientRect();
          const fg = getComputedStyle(root).color;
          const overLines = [...caption.querySelectorAll('.line')]
            .filter((el) => el.scrollWidth > r.width + 1)
            .map((el) => el.textContent);
          return {
            gap: d.top - c.bottom,
            captionBottom: c.bottom - r.top,
            deviceTop: d.top - r.top,
            overflowLines: overLines,
            fg,
          };
        });

        if (m.overflowLines.length) {
          violations.push(`${tag}: headline/subtitle overflows width: ${m.overflowLines.join(' / ')}`);
        }
        const minGap = dev.height * BAND_FRACTION;
        if (m.gap < minGap) {
          violations.push(`${tag}: caption-device gap ${Math.round(m.gap)}px < ${Math.round(minGap)}px`);
        }

        // 合成済み PNG があれば実物も検査: 端末直上バンドに本文色ピクセルが無いこと
        const dir = join(REPO_ROOT, 'store', 'screenshots', dev.store === 'apple' ? loc.asc : `${loc.asc}-${deviceId}`);
        const png = join(dir, `${String(i + 1).padStart(2, '0')}.png`);
        if (existsSync(png)) {
          const rel = png.slice(REPO_ROOT.length + 1);
          const bad = await page.evaluate(
            async ({ rel, top, bandH, fg }) => {
              const img = new Image();
              img.src = `/${rel}`;
              await img.decode();
              const cv = document.createElement('canvas');
              cv.width = img.naturalWidth;
              cv.height = img.naturalHeight;
              const ctx = cv.getContext('2d');
              ctx.drawImage(img, 0, 0);
              const band = ctx.getImageData(0, Math.max(0, top - bandH), cv.width, bandH).data;
              const m = fg.match(/\d+/g).map(Number);
              let hit = 0;
              for (let p = 0; p < band.length; p += 4) {
                if (
                  Math.abs(band[p] - m[0]) < 24 &&
                  Math.abs(band[p + 1] - m[1]) < 24 &&
                  Math.abs(band[p + 2] - m[2]) < 24
                ) hit++;
              }
              return hit / (band.length / 4);
            },
            { rel, top: Math.round(m.deviceTop), bandH: Math.round(minGap), fg: m.fg },
          );
          if (bad > PIXEL_TOLERANCE) {
            violations.push(`${tag}: composed PNG band has ${(bad * 100).toFixed(1)}% body-color pixels`);
          }
        }
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (violations.length) {
  console.error(`layout violations (${violations.length}):`);
  for (const v of violations) console.error(`  ${v}`);
  process.exitCode = 1;
} else {
  console.log('all slides OK');
}
