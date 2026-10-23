// node --test dist/checks/TraceCheck.test.js
// TraceCheck の統合: 作業ツリーと git (origin 役の main)、基準ファイル、コードの @trace、docs-check への登録。
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASELINE_FILE, fingerprint, formatBaseline } from '../core/trace/Baseline.js';
import { makeDoc, makeWorld } from '../core/trace/testing/Fixtures.test-support.js';
import type { TraceDocInput } from '../core/trace/TraceIndex.js';
import { DocsCheck } from './DocsCheck.js';
import { TraceCheck } from './TraceCheck.js';

const roots: string[] = [];
after(() => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const git = (root: string, ...args: string[]): void => {
  execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { stdio: 'ignore' });
};

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function writeDocs(root: string, docs: readonly TraceDocInput[]): void {
  for (const doc of docs) write(root, doc.path, `${doc.lines.join('\n')}\n`);
}

/** main に docs を commit した git の repo。main が origin の役 */
function makeRepo(docs: readonly TraceDocInput[]): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-trace-'));
  roots.push(root);
  git(root, 'init', '-q', '-b', 'main');
  writeDocs(root, docs);
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'docs');
  return root;
}

/** T3・T4 が出る世界 (REQ-101 に FN が無く、FN-010 に REQ が無い) */
const brokenWorld = (): TraceDocInput[] => makeWorld({ req: [['REQ-101', 'DEC-001', '']], fn: [['FN-010', '', 'SCR-101', 'API-001']] });
const check = new TraceCheck({ base: 'main' });

describe('TraceCheck: 基準', () => {
  it('[TST-921] 既存の違反を基準に記録して再実行すると違反 0 で、baselined の件数が出る', () => {
    const root = makeRepo(brokenWorld());
    const first = check.analyze(root);
    assert.ok(first.fresh.length > 0);
    write(root, BASELINE_FILE, formatBaseline(first.findings.filter((f) => f.level === 'violation').map(fingerprint)));
    const violations = check.run({ targetRoot: root, igetaRoot: root });
    assert.deepEqual(violations, []);
    assert.ok(check.warnings.some((line) => line.startsWith('baselined ')));
  });

  it('[TST-922] 基準に新しい指紋を手で足すと、origin の基準と比べて違反', () => {
    const root = makeRepo(brokenWorld());
    const known = check.analyze(root).findings.filter((f) => f.level === 'violation').map(fingerprint);
    write(root, BASELINE_FILE, formatBaseline(known));
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'baseline');
    write(root, BASELINE_FILE, formatBaseline([...known, 'T3|REQ-999|docs/x.md']));
    const violations = check.run({ targetRoot: root, igetaRoot: root });
    assert.deepEqual(violations.map((v) => [v.severity, v.file]), [['violation', BASELINE_FILE]]);
  });

  it('[TST-949][N5] origin が読めなければ、基準が増えていないか確かめられず cannot-check', () => {
    const root = makeRepo(brokenWorld());
    write(root, BASELINE_FILE, formatBaseline(['T3|REQ-101|docs/req.md']));
    const violations = new TraceCheck({ base: 'no-such-ref' }).run({ targetRoot: root, igetaRoot: root });
    assert.ok(violations.some((v) => v.severity === 'cannot-check' && v.file === BASELINE_FILE));
  });

  it('origin に基準ファイルが無い (初めて基準を入れる変更) なら、増加とは見ない', () => {
    const root = makeRepo(brokenWorld());
    write(root, BASELINE_FILE, formatBaseline(['T3|REQ-101|docs/req.md']));
    assert.deepEqual(check.analyze(root).growth, []);
  });

  it('基準ファイルの形が不正なら cannot-check (黙って空にしない)', () => {
    const root = makeRepo(brokenWorld());
    write(root, BASELINE_FILE, '{');
    assert.equal(check.analyze(root).fatal[0]?.severity, 'cannot-check');
  });
});

describe('TraceCheck: T1(b) と旧い構成', () => {
  it('[TST-909] 自分の差分で増えた REQ-120 が origin の別文書と衝突すれば違反 (git の main と比べる)', () => {
    const old = makeDoc({ path: 'docs/old.md', columns: ['上流 DEC:up'], headers: ['ID', '上流 DEC'], rows: [['REQ-120', '']] });
    const root = makeRepo([...makeWorld(), old]);
    writeDocs(root, [makeDoc({ path: 'docs/new.md', columns: ['上流 DEC:up'], headers: ['ID', '上流 DEC'], rows: [['REQ-120', '']] })]);
    const found = check.analyze(root).findings.filter((f) => f.rule === 'T1' && f.message.includes('origin'));
    assert.deepEqual(found.map((f) => [f.id, f.path]), [['REQ-120', 'docs/new.md']]);
  });

  it('origin が読めなければ T1(b) を見ていないと警告に出す (黙って省かない)', () => {
    const root = makeRepo(makeWorld());
    assert.ok(new TraceCheck({ base: 'no-such-ref' }).analyze(root).notes.some((note) => note.startsWith('T1(b) を見ていない')));
  });

  it('[TST-925] 定義が 0 件の repo は検査しない (違反も警告も 0)', () => {
    const root = makeRepo([makeDoc({ path: 'docs/plain.md', headers: ['ID'], rows: [['FN-010']] })]);
    assert.deepEqual(check.run({ targetRoot: root, igetaRoot: root }), []);
    assert.deepEqual(check.warnings, []);
  });
});

describe('TraceCheck: コードと登録', () => {
  it('[TST-919] .igeta.json の trace.code に入るファイルは、先頭行に @trace が無ければ違反', () => {
    const root = makeRepo(makeWorld());
    write(root, '.igeta.json', JSON.stringify({ trace: { code: ['src/**'] } }));
    write(root, 'src/a.ts', '// 概要\n// @trace FN-010\n');
    write(root, 'src/b.ts', '// 概要 @trace SCR-101 FN-010\n');
    const violations = check.run({ targetRoot: root, igetaRoot: root });
    assert.deepEqual(violations.map((v) => v.file), ['src/a.ts']);
  });

  it('docs-check が TraceCheck の違反を含める (登録)', async () => {
    const root = makeRepo(brokenWorld());
    const violations = await new DocsCheck().run({ targetRoot: root, igetaRoot: root });
    assert.ok(violations.some((v) => v.message.startsWith('[T3]')));
  });

  it('基準ファイルは読み戻せる JSON', () => {
    const root = makeRepo(brokenWorld());
    write(root, BASELINE_FILE, formatBaseline(['a']));
    assert.deepEqual(JSON.parse(readFileSync(join(root, BASELINE_FILE), 'utf8')), { version: 1, fingerprints: ['a'] });
  });
});
