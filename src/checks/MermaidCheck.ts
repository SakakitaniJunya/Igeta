// mermaid の早期検査 (mermaid-check)。既定 OFF。
// Spec: docs/explanation/05-coverage-and-learning.md §8 手順 4 (`mermaid-unrenderable` を評価より前に倒す)
//
// PDF 出力 (export) と同じ描画確認 (export/MermaidRuntime.ts) を、docs の任意の文書に対して
// 単独で実行する。export の manifest・章 (delivery-chapter) の縛りは無く、docs 内の全 .md
// (引数で絞れる) が対象。

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { chromium } from 'playwright-core';
import { findChromiumExecutable, PLAYWRIGHT_INSTALL_HINT } from '../export/Chromium.js';
import { MERMAID_RUNNER_SCRIPT, readMermaidRuntime, waitForMermaidRender } from '../export/MermaidRuntime.js';
import { restrictToOwnHtml } from '../export/PdfRenderer.js';
import { extractMermaidBlocks } from '../core/MermaidBlocks.js';
import type { Violation } from '../core/Report.js';

const SKIP_DIR = new Set(['node_modules', 'dist', 'coverage']);

function isDir(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function listMarkdown(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(full);
        continue;
      }
      if (entry.name.endsWith('.md') && entry.name !== 'README.md') found.push(full);
    }
  };
  walk(dir);
  return found;
}

interface LocatedBlock {
  readonly relPath: string;
  readonly line: number;
  readonly code: string;
}

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface MermaidCheckOptions {
  readonly targetRoot: string;
  readonly docsDir?: string;
  /** 絶対パス。省略なら docsDir 内の全 .md */
  readonly files?: readonly string[];
}

export interface MermaidCheckResult {
  readonly violations: readonly Violation[];
}

export async function checkMermaidRendering(options: MermaidCheckOptions): Promise<MermaidCheckResult> {
  const docsDir = options.docsDir ?? join(options.targetRoot, 'docs');
  let files: readonly string[];
  if (options.files !== undefined) {
    files = options.files;
  } else if (isDir(docsDir)) {
    files = listMarkdown(docsDir);
  } else {
    return { violations: [{ severity: 'cannot-check', message: `docs が無い: ${docsDir}` }] };
  }

  const blocks: LocatedBlock[] = [];
  for (const file of files) {
    const relPath = relative(options.targetRoot, file);
    if (!existsSync(file)) {
      return { violations: [{ severity: 'cannot-check', message: `ファイルが無い: ${relPath}` }] };
    }
    const content = readFileSync(file, 'utf8');
    // 図の取り出しは PersonFormCheck と同じ関数 (spec 08 D5)。閉じない図の指摘は PersonFormCheck (D2) の役目
    for (const block of extractMermaidBlocks(content.split(/\r?\n/), 0)) {
      if (block.closed && block.code !== undefined) blocks.push({ relPath, line: block.startLine, code: block.code });
    }
  }
  if (blocks.length === 0) return { violations: [] }; // 図が 1 つも無ければ Chromium すら要らない

  const executablePath = findChromiumExecutable();
  if (executablePath === null) {
    return { violations: [{ severity: 'cannot-check', message: `Chromium が見つからない。${PLAYWRIGHT_INSTALL_HINT}` }] };
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'igeta-mermaid-check-'));
  try {
    const idFor = (index: number): string => `mermaid-check-${index}`;
    const preElements = blocks
      .map((block, index) => `<pre class="mermaid" id="${idFor(index)}">${escapeHtml(block.code)}</pre>`)
      .join('\n');
    const html = [
      '<!doctype html>',
      '<html><head><meta charset="utf-8"></head><body>',
      preElements,
      `<script>${readMermaidRuntime()}</script>`,
      `<script>${MERMAID_RUNNER_SCRIPT}</script>`,
      '</body></html>',
    ].join('\n');
    const htmlPath = join(tmpDir, 'check.html');
    writeFileSync(htmlPath, html);

    const browser = await chromium.launch({ executablePath, headless: true });
    try {
      const page = await browser.newPage();
      const htmlUrl = `file://${htmlPath}`;
      await restrictToOwnHtml(page, htmlUrl);
      await page.goto(htmlUrl, { waitUntil: 'load' });
      const errors = await waitForMermaidRender(page);
      const violations: Violation[] = errors.map((error) => {
        const index = Number(error.id.slice('mermaid-check-'.length));
        const block = blocks[index];
        return {
          severity: 'violation',
          file: block?.relPath,
          line: block?.line,
          message: `mermaid 図の描画に失敗: ${error.message}`,
        };
      });
      return { violations };
    } finally {
      await browser.close();
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
