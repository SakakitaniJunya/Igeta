#!/usr/bin/env node
// raw（撮ったまま）→ 額装エディタの入力ディレクトリへの一方向コピー。
// composed を入力へ戻すと見出しが二重に乗るので、逆向きは実装しない。
//   store/screenshots_raw/<device>/<editor-locale>/NN.png
//     → store-screenshots/screenshots/<store>/<device>/<editor-locale>/NN.png
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, DEVICES } from './locales.mjs';
import { SLIDES } from '../store-screenshots/src/defaults.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'store', 'screenshots_raw');
const inputDir = join(root, 'store-screenshots', 'screenshots');

const missing = [];
let copied = 0;

for (const loc of LOCALES) {
  for (const [deviceId, dev] of Object.entries(DEVICES)) {
    for (let i = 0; i < SLIDES.length; i++) {
      const name = `${String(i + 1).padStart(2, '0')}.png`;
      const src = join(rawDir, deviceId, loc.editor, name);
      const dst = join(inputDir, dev.store, deviceId, loc.editor, name);
      if (!existsSync(src)) {
        missing.push(`${deviceId}/${loc.editor}/${name}`);
        continue;
      }
      mkdirSync(dirname(dst), { recursive: true });
      cpSync(src, dst);
      copied++;
    }
  }
}

console.log(`synced ${copied} files`);
if (missing.length) {
  console.error(`missing raw screenshots (${missing.length}):`);
  for (const m of missing) console.error(`  ${m}`);
  process.exitCode = 1;
}
