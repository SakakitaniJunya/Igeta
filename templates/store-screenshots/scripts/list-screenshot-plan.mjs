#!/usr/bin/env node
// 撮影計画を capture スクリプトへ供給する。
// 各行: <NN> <scenario> <anchor>
import { SLIDES } from '../store-screenshots/src/defaults.mjs';
import { LOCALES } from './locales.mjs';

const mode = process.argv[2] ?? 'plan';

if (mode === 'locales') {
  for (const l of LOCALES) console.log(`${l.editor} ${l.snapshot} ${l.asc}`);
} else if (mode === 'plan') {
  SLIDES.forEach((s, i) => {
    console.log(`${String(i + 1).padStart(2, '0')} ${s.capture} ${s.anchor}`);
  });
} else {
  console.error(`usage: list-screenshot-plan.mjs [plan|locales]`);
  process.exit(1);
}
