// node --test dist
// html-only までは Chromium 無しで検証する。PDF 化 (Chromium 必須) は 1 本だけ、
// findChromiumExecutable() が見つけられた環境でのみ走らせ、無ければ skip を明示する。
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { findChromiumExecutable } from './Chromium.js';
import { runExport } from './ExportPipeline.js';
import { PRINTABLE_HEIGHT_MM, PRINTABLE_WIDTH_MM, mmToPx } from './PdfLayout.js';

const workspaces: string[] = [];

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'igeta-export-pipeline-'));
  workspaces.push(dir);
  return dir;
}

function writeFixture(
  dir: string,
  overrides: Record<string, unknown> = {},
): { manifestPath: string } {
  writeFileSync(
    join(dir, '00-intro.md'),
    ['---', 'id: intro', 'kind: delivery-chapter', '---', '', '# はじめに', '', '本文です。', ''].join('\n'),
  );
  writeFileSync(
    join(dir, '01-flows.md'),
    [
      '---',
      'id: flows',
      'kind: delivery-chapter',
      '---',
      '',
      '# 処理フロー',
      '',
      '## 処理の流れ',
      '',
      '```mermaid',
      'flowchart LR',
      '  A[開始] --> B[終了]',
      '```',
      '',
      '[はじめに](00-intro.md) に戻る。',
      '',
    ].join('\n'),
  );
  const manifest = {
    title: 'サンプル設計書',
    recipient: 'サンプル株式会社 御中',
    issuer: 'CreaNest 株式会社',
    version: '1.0',
    date: '2026-09-29',
    chapters: ['00-intro.md', '01-flows.md'],
    forbid: ['DEC-\\d', 'REQ-\\d'],
    output: 'out/design-document.pdf',
    ...overrides,
  };
  const manifestPath = join(dir, 'deliverable.json');
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return { manifestPath };
}

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('runExport — manifest / forbid ゲート', () => {
  it('manifest が壊れていれば manifest-error', async () => {
    const dir = makeWorkspace();
    const manifestPath = join(dir, 'deliverable.json');
    writeFileSync(manifestPath, '{ not json');
    const outcome = await runExport({ manifestPath, htmlOnly: true });
    assert.equal(outcome.kind, 'manifest-error');
  });

  it('forbid に一致する語があれば forbid-violation (何も書かない)', async () => {
    const dir = makeWorkspace();
    writeFileSync(join(dir, '00-intro.md'), '# はじめに\n\nDEC-1 が本文に混入。\n');
    const manifest = {
      title: 'T',
      recipient: 'R',
      issuer: 'I',
      version: '1.0',
      date: '2026-09-29',
      chapters: ['00-intro.md'],
      forbid: ['DEC-\\d'],
      output: 'out/x.pdf',
    };
    const manifestPath = join(dir, 'deliverable.json');
    writeFileSync(manifestPath, JSON.stringify(manifest));

    const outcome = await runExport({ manifestPath, htmlOnly: true });
    assert.equal(outcome.kind, 'forbid-violation');
    if (outcome.kind === 'forbid-violation') {
      assert.equal(outcome.hits.length, 1);
      assert.equal(outcome.hits[0]?.word, 'DEC-1');
    }
    assert.equal(existsSync(join(dir, 'out')), false);
  });
});

describe('runExport — html-only', () => {
  it('自己完結 HTML を書き出し、mermaid ランタイムと目次・表紙を含む', async () => {
    const dir = makeWorkspace();
    const { manifestPath } = writeFixture(dir);

    const outcome = await runExport({ manifestPath, htmlOnly: true });
    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    assert.equal(outcome.pdfPath, null);
    assert.ok(existsSync(outcome.htmlPath));

    const html = readFileSync(outcome.htmlPath, 'utf8');
    assert.match(html, /class="cover"/);
    assert.match(html, /目次/);
    assert.match(html, /class="mermaid"/);
    assert.match(html, /window\.mermaid|mermaid\.initialize/); // mermaid runtime がインライン
    assert.match(html, /サンプル株式会社 御中/); // recipient をそのまま出す (様を付けない)
    assert.ok(!html.includes('サンプル株式会社 御中 様'));
  });

  it('recipient を省略・空文字にすると表紙に宛名の行を出さない (空の枠や undefined も出さない)', async () => {
    const dir = makeWorkspace();
    const { manifestPath } = writeFixture(dir, { recipient: '' });

    const outcome = await runExport({ manifestPath, htmlOnly: true });
    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;

    const html = readFileSync(outcome.htmlPath, 'utf8');
    const metaSection = /<div class="meta">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '';
    assert.notEqual(metaSection, '');
    assert.ok(!metaSection.includes('undefined'));
    assert.ok(!metaSection.includes('<div></div>'));
    assert.match(metaSection, /CreaNest 株式会社/); // issuer は出る
  });
});

describe('runExport — omitSections', () => {
  function writeChapterWithRelated(dir: string): string {
    const manifestPath = join(dir, 'deliverable.json');
    writeFileSync(
      join(dir, '00-intro.md'),
      [
        '# はじめに',
        '',
        '## 関連',
        '',
        '| 区分 | 文書 | 対応 ID |',
        '|---|---|---|',
        '| 上流 (depends_on) | 社内設計書 | DEC-1 |',
        '',
        '## 概要',
        '',
        '先方に見せる本文。',
        '',
      ].join('\n'),
    );
    return manifestPath;
  }

  it('既定で「関連」節を除き、中身 (forbid 一致語含む) をどこにも出力しない', async () => {
    const dir = makeWorkspace();
    const manifestPath = writeChapterWithRelated(dir);
    writeFileSync(
      manifestPath,
      JSON.stringify({
        title: 'T',
        recipient: 'R',
        issuer: 'I',
        version: '1.0',
        date: '2026-09-29',
        chapters: ['00-intro.md'],
        forbid: ['DEC-\\d'],
        output: 'out/x.pdf',
      }),
    );

    const outcome = await runExport({ manifestPath, htmlOnly: true });
    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    const html = readFileSync(outcome.htmlPath, 'utf8');
    assert.ok(!html.includes('DEC-1'));
    assert.ok(!html.includes('上流 (depends_on)'));
    assert.match(html, /先方に見せる本文/);
  });

  it('omitSections を上書きすれば別の節を除ける', async () => {
    const dir = makeWorkspace();
    writeFileSync(
      join(dir, '00-intro.md'),
      ['# はじめに', '', '## 社内メモ', '', 'DEC-1 の背景。', '', '## 概要', '', '本文。', ''].join('\n'),
    );
    const manifestPath = join(dir, 'deliverable.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        title: 'T',
        recipient: 'R',
        issuer: 'I',
        version: '1.0',
        date: '2026-09-29',
        chapters: ['00-intro.md'],
        forbid: ['DEC-\\d'],
        omitSections: ['社内メモ'],
        output: 'out/x.pdf',
      }),
    );

    const outcome = await runExport({ manifestPath, htmlOnly: true });
    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    const html = readFileSync(outcome.htmlPath, 'utf8');
    assert.ok(!html.includes('DEC-1'));
    assert.match(html, /本文。/);
  });

  it('omitSections: [] を渡すと「関連」節も除かれず、forbid に引っかかる', async () => {
    const dir = makeWorkspace();
    const manifestPath = writeChapterWithRelated(dir);
    writeFileSync(
      manifestPath,
      JSON.stringify({
        title: 'T',
        recipient: 'R',
        issuer: 'I',
        version: '1.0',
        date: '2026-09-29',
        chapters: ['00-intro.md'],
        forbid: ['DEC-\\d'],
        omitSections: [],
        output: 'out/x.pdf',
      }),
    );

    const outcome = await runExport({ manifestPath, htmlOnly: true });
    assert.equal(outcome.kind, 'forbid-violation');
    if (outcome.kind !== 'forbid-violation') return;
    assert.equal(outcome.hits[0]?.word, 'DEC-1');
  });
});

describe('runExport — PDF 化', () => {
  const executable = findChromiumExecutable();

  it(
    'Chromium で A4 PDF を書き出す (mermaid 図を含む)',
    { skip: executable === null ? 'Chromium キャッシュが見つからない (npx playwright install chromium で用意すると走る)' : false },
    async () => {
      const dir = makeWorkspace();
      const { manifestPath } = writeFixture(dir);

      const outcome = await runExport({ manifestPath, htmlOnly: false });
      assert.equal(outcome.kind, 'ok');
      if (outcome.kind !== 'ok' || outcome.pdfPath === null) return;

      assert.ok(existsSync(outcome.pdfPath));
      const bytes = readFileSync(outcome.pdfPath);
      assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
      assert.ok(statSync(outcome.pdfPath).size > 1000);
    },
  );
});

describe('runExport — 縦に長い mermaid 図の高さ上限', () => {
  const executable = findChromiumExecutable();

  it(
    '縦に長い図でも、描画後の高さが 1 ページの印字可能領域以下に収まる',
    { skip: executable === null ? 'Chromium キャッシュが見つからない (npx playwright install chromium で用意すると走る)' : false },
    async () => {
      const dir = makeWorkspace();
      // 1 ページに収まらないほど縦に長い flowchart (TB) をわざと作る
      const nodes = Array.from({ length: 25 }, (_, i) => `n${i}["段階 ${i}"]`).join(' --> ');
      writeFileSync(
        join(dir, '00-intro.md'),
        ['# はじめに', '', '```mermaid', 'flowchart TB', nodes, '```', ''].join('\n'),
      );
      const manifestPath = join(dir, 'deliverable.json');
      writeFileSync(
        manifestPath,
        JSON.stringify({
          title: 'T',
          issuer: 'I',
          version: '1.0',
          date: '2026-09-29',
          chapters: ['00-intro.md'],
          output: 'out/x.pdf',
        }),
      );

      const outcome = await runExport({ manifestPath, htmlOnly: true });
      assert.equal(outcome.kind, 'ok');
      if (outcome.kind !== 'ok') return;

      const executablePath = findChromiumExecutable();
      assert.ok(executablePath !== null);
      const browser = await chromium.launch({ executablePath, headless: true });
      try {
        const page = await browser.newPage();
        await page.goto(`file://${outcome.htmlPath}`, { waitUntil: 'load' });
        await page.waitForFunction(
          () => (globalThis as unknown as { __mermaidDone__?: boolean }).__mermaidDone__ === true,
          { timeout: 30_000 },
        );
        interface RectLike {
          getBoundingClientRect(): { height: number };
        }
        const heightsMm = await page.evaluate(() => {
          const MM_PER_PX = 25.4 / 96;
          const doc = (globalThis as unknown as { document: { querySelectorAll(selector: string): RectLike[] } })
            .document;
          return Array.from(doc.querySelectorAll('pre.mermaid')).map(
            (el) => el.getBoundingClientRect().height * MM_PER_PX,
          );
        });
        assert.ok(heightsMm.length > 0, '図が 1 個も見つからない');
        for (const heightMm of heightsMm) {
          assert.ok(
            heightMm <= PRINTABLE_HEIGHT_MM + 1,
            `図の高さ ${heightMm}mm が 1 ページの印字可能領域 ${PRINTABLE_HEIGHT_MM}mm を超えている`,
          );
        }
      } finally {
        await browser.close();
      }
    },
  );
});

describe('runExport — 表の列幅', () => {
  const executable = findChromiumExecutable();

  it(
    '短い 1 列目と長い 3 列の表で、全セルが最小幅以上・表の幅が本文幅以下になる',
    { skip: executable === null ? 'Chromium キャッシュが見つからない (npx playwright install chromium で用意すると走る)' : false },
    async () => {
      const dir = makeWorkspace();
      const table = [
        '| 画面 | 空のとき | 読み込み中 | エラーのとき |',
        '|---|---|---|---|',
        '| 商品一覧 | この条件に合う商品がありませんと表示する | 商品カードの形をしたプレースホルダーを表示する | 空き状況が取得できない場合も一覧自体は表示を続ける |',
        '| カート | カートに商品がありませんと表示する | 明細のプレースホルダーを表示する | 空き状況を確認できませんと表示する |',
      ].join('\n');
      writeFileSync(join(dir, '00-intro.md'), ['# はじめに', '', table, ''].join('\n'));
      const manifestPath = join(dir, 'deliverable.json');
      writeFileSync(
        manifestPath,
        JSON.stringify({
          title: 'T',
          issuer: 'I',
          version: '1.0',
          date: '2026-09-29',
          chapters: ['00-intro.md'],
          output: 'out/x.pdf',
        }),
      );

      const outcome = await runExport({ manifestPath, htmlOnly: true });
      assert.equal(outcome.kind, 'ok');
      if (outcome.kind !== 'ok') return;

      const executablePath = findChromiumExecutable();
      assert.ok(executablePath !== null);
      const browser = await chromium.launch({ executablePath, headless: true });
      try {
        const page = await browser.newPage();
        // PdfRenderer.ts と同じビューポート幅 (印字できる本文幅) で読み込む
        await page.setViewportSize({ width: mmToPx(PRINTABLE_WIDTH_MM), height: 2000 });
        await page.goto(`file://${outcome.htmlPath}`, { waitUntil: 'load' });

        interface TableMeasurement {
          readonly bodyWidth: number;
          readonly tableWidth: number;
          readonly cellWidths: readonly number[];
          readonly minWidthPx: number;
        }
        interface DomElementLike {
          getBoundingClientRect(): { width: number };
          querySelectorAll(selector: string): DomElementLike[];
        }
        interface DomWindowLike {
          document: {
            querySelector(selector: string): DomElementLike | null;
            body: { clientWidth: number };
          };
          getComputedStyle(el: DomElementLike): { minWidth: string };
        }
        const measurement = await page.evaluate<TableMeasurement>(() => {
          const win = globalThis as unknown as DomWindowLike;
          const table = win.document.querySelector('table');
          if (table === null) throw new Error('table が見つからない');
          const cells = Array.from(table.querySelectorAll('th, td'));
          const firstCell = cells[0];
          if (firstCell === undefined) throw new Error('セルが見つからない');
          return {
            bodyWidth: win.document.body.clientWidth,
            tableWidth: table.getBoundingClientRect().width,
            cellWidths: cells.map((cell) => cell.getBoundingClientRect().width),
            minWidthPx: parseFloat(win.getComputedStyle(firstCell).minWidth),
          };
        });

        assert.ok(
          measurement.tableWidth <= measurement.bodyWidth + 1,
          `表の幅 ${measurement.tableWidth}px が本文幅 ${measurement.bodyWidth}px を超えている`,
        );
        for (const cellWidth of measurement.cellWidths) {
          assert.ok(
            cellWidth >= measurement.minWidthPx - 1,
            `セルの幅 ${cellWidth}px が最小幅 ${measurement.minWidthPx}px を下回っている`,
          );
        }
      } finally {
        await browser.close();
      }
    },
  );
});
