// node --test dist/cli/commands/TraceCommand.test.js
// `igeta trace` の木・--mermaid・--update-baseline・終了コード。
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASELINE_FILE } from '../../core/trace/Baseline.js';
import { makeWorld } from '../../core/trace/testing/Fixtures.test-support.js';
import type { TraceDocInput } from '../../core/trace/TraceIndex.js';
import { Cli } from '../Cli.js';
import { TraceCommand } from './TraceCommand.js';

const roots: string[] = [];
after(() => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function makeRepo(docs: readonly TraceDocInput[]): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-tracecmd-'));
  roots.push(root);
  const git = (...args: string[]): void => void execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  writeDocs(root, docs);
  git('add', '-A');
  git('commit', '-qm', 'docs');
  return root;
}

function writeDocs(root: string, docs: readonly TraceDocInput[]): void {
  for (const doc of docs) {
    mkdirSync(dirname(join(root, doc.path)), { recursive: true });
    writeFileSync(join(root, doc.path), `${doc.lines.join('\n')}\n`);
  }
}

async function run(root: string, ...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await new Cli().register(new TraceCommand()).run(['trace', ...argv, '--root', root, '--base', 'main'], {
    cwd: root, igetaRoot: root, stdout: (line) => out.push(line), stderr: (line) => err.push(line),
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

const broken = (): TraceDocInput[] => makeWorld({ req: [['REQ-101', 'DEC-001', '']], fn: [['FN-010', '', 'SCR-101', 'API-001']] });

describe('igeta trace', () => {
  it('ID を渡すと上流・下流の木を出して Ok。--mermaid は flowchart TB', async () => {
    const root = makeRepo(makeWorld());
    const text = await run(root, 'DEC-001');
    assert.equal(text.code, 0);
    assert.match(text.out, /○ FN-010/);
    assert.match((await run(root, 'DEC-001', '--mermaid')).out, /^flowchart TB/);
  });

  it('[TST-924] 定義の無い ID (DEC-901) は終了コード 2', async () => {
    const result = await run(makeRepo(makeWorld()), 'DEC-901');
    assert.equal(result.code, 2);
    assert.match(result.err, /DEC-901/);
  });

  it('ID なしは検査: 違反があれば 1、無ければ OK で 0', async () => {
    assert.equal((await run(makeRepo(broken()))).code, 1);
    const clean = await run(makeRepo(makeWorld()));
    assert.deepEqual([clean.code, clean.out], [0, 'OK trace-check']);
  });

  it('--update-baseline は、基準が無ければ今の違反を全部記録して Ok', async () => {
    const root = makeRepo(broken());
    assert.equal((await run(root, '--update-baseline')).code, 0);
    const written = JSON.parse(readFileSync(join(root, BASELINE_FILE), 'utf8')) as { fingerprints: string[] };
    assert.ok(written.fingerprints.some((item) => item.startsWith('T3|REQ-101|')));
    assert.equal((await run(root)).code, 0);
  });

  it('[TST-923] 違反を直して --update-baseline すると指紋が消える。新しい違反は足さず、残れば 1', async () => {
    const root = makeRepo(broken());
    await run(root, '--update-baseline');
    writeDocs(root, makeWorld({ dec: [['DEC-001', '作る物', 'REQ-101']] }));
    const fixed = await run(root, '--update-baseline');
    assert.equal(fixed.code, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(root, BASELINE_FILE), 'utf8')).fingerprints, []);

    writeDocs(root, broken());
    const regress = await run(root, '--update-baseline');
    assert.equal(regress.code, 1);
    assert.deepEqual(JSON.parse(readFileSync(join(root, BASELINE_FILE), 'utf8')).fingerprints, []);
  });

  it('余分な位置引数は検査不能 (2)', async () => {
    assert.equal((await run(makeRepo(makeWorld()), 'DEC-001', 'FN-010')).code, 2);
  });
});
