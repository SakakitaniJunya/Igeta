// node --test dist
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnalyzeModule } from './AnalyzeModule.js';

const workspaces: string[] = [];

function writeDoc(root: string, rel: string, content: string): void {
  const target = join(root, 'docs', rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('AnalyzeModule', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'igeta-analyze-'));
    workspaces.push(root);
  });

  it('正例: REQ→FN→タスクが揃っていれば findings は info のみ (critical/warning 無し)', () => {
    writeDoc(root, 'product/requirements.md', ['---', 'id: requirements', 'kind: requirements', '---', '', '| REQ-001 |', ''].join('\n'));
    writeDoc(
      root,
      'design/basic/function-list.md',
      ['---', 'id: function-list', 'kind: function-list', '---', '', '| FN-001 | REQ-001 |', ''].join('\n'),
    );
    writeDoc(
      root,
      'design/tasks/feature.md',
      ['---', 'id: tasks-feature', 'kind: tasks', '---', '', '- [ ] T001 [P] [FN-001] 実装する (src/feature.ts)', ''].join('\n'),
    );
    const result = new AnalyzeModule({ targetRoot: root }).analyze();
    assert.equal(result.hasCritical, false, result.markdown);
    assert.ok(!result.findings.some((f) => f.severity === 'warning'), result.markdown);
    assert.match(result.markdown, /REQ → FN: 1\/1/);
    assert.match(result.markdown, /FN → タスク: 1\/1/);
  });

  it('負例: REQ に対応する FN が無ければ warning', () => {
    writeDoc(root, 'product/requirements.md', ['---', 'id: requirements', 'kind: requirements', '---', '', '| REQ-001 |', ''].join('\n'));
    writeDoc(
      root,
      'design/basic/function-list.md',
      ['---', 'id: function-list', 'kind: function-list', '---', '', '見出しだけ', ''].join('\n'),
    );
    const result = new AnalyzeModule({ targetRoot: root }).analyze();
    assert.equal(result.hasCritical, false);
    const hit = result.findings.find((f) => f.kind === '網羅 (REQ→FN)');
    assert.ok(hit, result.markdown);
    assert.equal(hit?.id, 'REQ-001');
  });

  it('負例: FN に対応するタスクが無ければ warning', () => {
    writeDoc(
      root,
      'design/basic/function-list.md',
      ['---', 'id: function-list', 'kind: function-list', '---', '', '| FN-001 |', ''].join('\n'),
    );
    writeDoc(root, 'design/tasks/feature.md', ['---', 'id: tasks-feature', 'kind: tasks', '---', '', '説明のみ', ''].join('\n'));
    const result = new AnalyzeModule({ targetRoot: root }).analyze();
    const hit = result.findings.find((f) => f.kind === '網羅 (FN→タスク)');
    assert.ok(hit, result.markdown);
    assert.equal(hit?.id, 'FN-001');
  });

  it('負例: タスクが存在しない ID を参照していたら critical (exit を Violation にする根拠)', () => {
    writeDoc(
      root,
      'design/tasks/feature.md',
      ['---', 'id: tasks-feature', 'kind: tasks', '---', '', '- [ ] T001 [P] [FN-999] 実装する (src/feature.ts)', ''].join('\n'),
    );
    const result = new AnalyzeModule({ targetRoot: root }).analyze();
    assert.equal(result.hasCritical, true, result.markdown);
    const hit = result.findings.find((f) => f.severity === 'critical');
    assert.match(hit?.summary ?? '', /FN-999/);
  });

  it('未決 OPEN は info として一覧に出る', () => {
    writeDoc(
      root,
      '01-decisions.md',
      ['---', 'id: decisions', 'kind: decision-log', '---', '', '| OPEN-001 | 猶予日数 |', ''].join('\n'),
    );
    const result = new AnalyzeModule({ targetRoot: root }).analyze();
    const hit = result.findings.find((f) => f.kind === '未決 (OPEN)');
    assert.ok(hit, result.markdown);
    assert.equal(hit?.id, 'OPEN-001');
    assert.equal(hit?.severity, 'info');
    assert.equal(result.hasCritical, false);
  });

  it('曖昧語を検出する (既定の語彙)', () => {
    writeDoc(
      root,
      'product/requirements.md',
      ['---', 'id: requirements', 'kind: requirements', '---', '', 'レスポンスは速いこと。', ''].join('\n'),
    );
    const result = new AnalyzeModule({ targetRoot: root }).analyze();
    const hit = result.findings.find((f) => f.kind === '曖昧語' && f.id === '速い');
    assert.ok(hit, result.markdown);
    assert.equal(hit?.severity, 'warning');
  });

  it('曖昧語の語彙は上書きできる', () => {
    writeDoc(
      root,
      'product/requirements.md',
      ['---', 'id: requirements', 'kind: requirements', '---', '', 'カスタム語彙の例。', ''].join('\n'),
    );
    const result = new AnalyzeModule({ targetRoot: root, ambiguousWords: ['カスタム語彙'] }).analyze();
    const hit = result.findings.find((f) => f.kind === '曖昧語');
    assert.equal(hit?.id, 'カスタム語彙');
  });

  it('ローカル採番の重複は info (違反にしない)', () => {
    writeDoc(root, 'product/requirements.md', ['---', 'id: requirements', 'kind: requirements', '---', '', '| REQ-001 |', ''].join('\n'));
    writeDoc(root, 'product/other.md', ['---', 'id: other', 'kind: requirements', '---', '', '| REQ-001 |', ''].join('\n'));
    const result = new AnalyzeModule({ targetRoot: root }).analyze();
    const hit = result.findings.find((f) => f.kind === '重複 (ローカル採番)' && f.id === 'REQ-001');
    assert.ok(hit, result.markdown);
    assert.equal(hit?.severity, 'info');
    assert.equal(result.hasCritical, false);
  });

  it('function-list / tasks が 1 本も無いツリーでは網羅を評価対象外にする (サイレント縮退にしない)', () => {
    writeDoc(root, 'product/requirements.md', ['---', 'id: requirements', 'kind: requirements', '---', '', '| REQ-001 |', ''].join('\n'));
    const result = new AnalyzeModule({ targetRoot: root }).analyze();
    assert.ok(!result.findings.some((f) => f.kind.startsWith('網羅')), result.markdown);
    assert.match(result.markdown, /REQ → FN: 評価対象外/);
    assert.match(result.markdown, /FN → タスク: 評価対象外/);
  });
});
