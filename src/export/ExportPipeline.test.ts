// node --test dist
// html-only までは Chromium 無しで検証する。PDF 化 (Chromium 必須) は 1 本だけ、
// findChromiumExecutable() が見つけられた環境でのみ走らせ、無ければ skip を明示する。
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findChromiumExecutable } from './Chromium.js';
import { runExport } from './ExportPipeline.js';

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
