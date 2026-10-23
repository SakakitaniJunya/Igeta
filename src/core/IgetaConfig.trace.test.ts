// node --test dist/core/IgetaConfig.trace.test.js
// `.igeta.json` の trace の読み取り (ADR-0015)。設定ファイルを開くのは loadIgetaConfig だけ。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_IGETA_CONFIG, loadIgetaConfig } from './IgetaConfig.js';
import { DEFAULT_TEST_GLOBS, DEFAULT_TRACE_KINDS, readTraceConfig } from './trace/TraceConfig.js';

const roots: string[] = [];
function rootWith(content: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-traceconfig-'));
  roots.push(root);
  if (content !== undefined) writeFileSync(join(root, '.igeta.json'), JSON.stringify(content));
  return root;
}
after(() => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('IgetaConfig の trace', () => {
  it('trace が無ければ既定値 (空の設定)。readTraceConfig が既定の種類・warn・strictEdges なしを足す', () => {
    assert.deepEqual(loadIgetaConfig(rootWith({})), { config: DEFAULT_IGETA_CONFIG });
    const read = readTraceConfig(rootWith(undefined));
    assert.deepEqual(read, { config: { kinds: DEFAULT_TRACE_KINDS, code: [], tests: DEFAULT_TEST_GLOBS, columns: [], bands: [], strictEdges: false, tblRule: 'warn', base: 'origin/main' } });
  });

  it('trace の項目を読む', () => {
    const read = readTraceConfig(rootWith({ trace: { kinds: ['REQ'], code: ['src/**'], tests: ['t/**'], strictEdges: true, tblRule: 'error', base: 'develop', bands: ['機能要件:1'], columns: ['上流 X:up'] } }));
    assert.deepEqual(read, { config: { kinds: ['REQ'], code: ['src/**'], tests: ['t/**'], columns: ['上流 X:up'], bands: ['機能要件:1'], strictEdges: true, tblRule: 'error', base: 'develop' } });
  });

  it('trace の誤りは .igeta.json 全体を無効にしない: ほかの設定は読め、誤りは traceProblem に残る', () => {
    const loaded = loadIgetaConfig(rootWith({ humanPaths: ['a/**'], trace: { kinds: 'FN' } }));
    assert.ok('config' in loaded);
    assert.deepEqual(loaded.config.humanPaths, ['a/**']);
    assert.equal(loaded.config.traceProblem?.severity, 'cannot-check');
    assert.deepEqual(loaded.config.trace, {});
  });

  it('形が不正な trace は CannotCheck (黙って既定値に倒さない)', () => {
    for (const trace of [[], { kinds: 'FN' }, { strictEdges: 'yes' }, { tblRule: 'off' }, { base: '' }, { code: ['src/{a'] }, { tests: ['**/[x'] }, { kinds: [] }, { kinds: [''] }, { kinds: ['fn'] }]) {
      const read = readTraceConfig(rootWith({ trace }));
      assert.ok('violation' in read && read.violation.severity === 'cannot-check', JSON.stringify(trace));
    }
  });
});
