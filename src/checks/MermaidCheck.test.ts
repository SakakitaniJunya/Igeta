// node --test dist/checks/MermaidCheck.test.js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkMermaidRendering } from './MermaidCheck.js';
import { findChromiumExecutable } from '../export/Chromium.js';
import { ExitCode } from '../core/ExitCode.js';
import { Report } from '../core/Report.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'yatsu-mermaidcheck-'));
  workspaces.push(root);
  return root;
}

function writeDoc(root: string, rel: string, content: string): void {
  const target = join(root, 'docs', rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

async function run(root: string): Promise<{ report: Report }> {
  const { violations } = await checkMermaidRendering({ targetRoot: root });
  const report = new Report();
  report.addAll(violations);
  return { report };
}

const chromiumAvailable = findChromiumExecutable() !== null;
const skipReason = chromiumAvailable ? false : 'Chromium キャッシュが見つからない (npx playwright install chromium で用意すると走る)';

describe('checkMermaidRendering', () => {
  it('正例: 図が 1 つも無ければ Chromium 無しでも Ok', async () => {
    const root = makeRoot();
    writeDoc(root, 'x.md', '# x\n\n本文だけ。\n');
    const { report } = await run(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('検査不能: docs が無い', async () => {
    const root = makeRoot();
    const { report } = await run(root);
    assert.equal(report.exitCode, ExitCode.CannotCheck, report.format());
  });

  it('正例: 描画できる mermaid 図なら通る', { skip: skipReason }, async () => {
    const root = makeRoot();
    writeDoc(root, 'x.md', ['# x', '', '```mermaid', 'flowchart LR', '  A --> B', '```', ''].join('\n'));
    const { report } = await run(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('違反: 描画できない mermaid 図は file:line と理由つきで落ちる', { skip: skipReason }, async () => {
    const root = makeRoot();
    writeDoc(
      root,
      'design/flow.md',
      ['# フロー', '', '本文。', '', '```mermaid', 'flowchart LR', '  A --> ; invalid syntax', '```', ''].join('\n'),
    );
    const { report } = await run(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /docs[\\/]design[\\/]flow\.md:5/);
    assert.match(report.format(), /mermaid 図の描画に失敗/);
  });

  it('複数文書の複数図を正しく file:line に対応づける', { skip: skipReason }, async () => {
    const root = makeRoot();
    writeDoc(root, 'a.md', ['# a', '', '```mermaid', 'flowchart LR', '  A --> B', '```', ''].join('\n'));
    writeDoc(
      root,
      'b.md',
      ['# b', '', '本文。', '', '```mermaid', 'flowchart LR', '  A --> ; invalid', '```', ''].join('\n'),
    );
    const { report } = await run(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /docs[\\/]b\.md:5/);
    assert.doesNotMatch(report.format(), /docs[\\/]a\.md/);
  });

  it('--files 相当 (options.files) で対象を絞れる', { skip: skipReason }, async () => {
    const root = makeRoot();
    writeDoc(root, 'a.md', ['# a', '', '```mermaid', 'flowchart LR', '  A --> ; invalid', '```', ''].join('\n'));
    writeDoc(root, 'b.md', '# b\n\n本文だけ。\n');
    const { violations } = await checkMermaidRendering({ targetRoot: root, files: [join(root, 'docs', 'b.md')] });
    assert.equal(violations.length, 0, JSON.stringify(violations));
  });
});
