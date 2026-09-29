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

  it('function-list / tasks での言及 (行頭セルではない参照) は「定義」に数えない (code-reviewer 実バグ #7、#3 と共有)', () => {
    // requirements-a だけが REQ-101 を要件表の行頭セルで定義する。複数節を持つ実テンプレに近い構成。
    writeDoc(
      root,
      'product/01-requirements.md',
      [
        '---', 'id: requirements-a', 'kind: requirements', '---', '',
        '## 1. 業務要件', '', '| REQ-101 | 業務要件本文 | 現状の課題 | 受入基準 |', '',
        '## 2. 機能要件', '', '| REQ-102 | Event | 別の要件文 |', '',
      ].join('\n'),
    );
    // function-list.md は FN-001/FN-002 の行の**対応 REQ 列**で REQ-101 に言及するだけ (行頭セルは FN)
    writeDoc(
      root,
      'design/basic/01-function-list.md',
      [
        '---', 'id: function-list', 'kind: function-list', '---', '',
        '## 1. 機能一覧', '',
        '| ID | 機能名 | 対応 REQ |', '|---|---|---|',
        '| FN-001 | 予約する | REQ-101 |',
        '| FN-002 | 予約を確認する | REQ-101 |',
        '',
      ].join('\n'),
    );
    // tasks.md はタスク行の参照ブラケットで REQ-101/FN-001 に言及するだけ (行頭は `- [ ]`)
    writeDoc(
      root,
      'design/tasks/01-feature.md',
      ['---', 'id: tasks-feature', 'kind: tasks', '---', '', '- [ ] T001 [P] [FN-001] 予約 API を実装する (src/reservation.ts)', ''].join(
        '\n',
      ),
    );
    const result = new AnalyzeModule({ targetRoot: root }).analyze();
    const dup = result.findings.find((f) => f.kind === '重複 (ローカル採番)' && f.id === 'REQ-101');
    assert.equal(dup, undefined, JSON.stringify(result.findings));
  });

  it('function-list / tasks が 1 本も無いツリーでは網羅を評価対象外にする (サイレント縮退にしない)', () => {
    writeDoc(root, 'product/requirements.md', ['---', 'id: requirements', 'kind: requirements', '---', '', '| REQ-001 |', ''].join('\n'));
    const result = new AnalyzeModule({ targetRoot: root }).analyze();
    assert.ok(!result.findings.some((f) => f.kind.startsWith('網羅')), result.markdown);
    assert.match(result.markdown, /REQ → FN: 評価対象外/);
    assert.match(result.markdown, /FN → タスク: 評価対象外/);
  });

  it('docs/ が無ければ cannotCheck: true (exit 2 の根拠、サイレント縮退にしない。code-reviewer round 3 C3)', () => {
    rmSync(join(root, 'docs'), { recursive: true, force: true });
    const result = new AnalyzeModule({ targetRoot: root }).analyze();
    assert.equal(result.cannotCheck, true, result.markdown);
    assert.equal(result.hasCritical, false);
    assert.equal(result.findings.length, 0);
    assert.match(result.markdown, /CANNOT-CHECK docs が無い/);
  });

  it('タスク行のパース失敗は件数を warning として表示する (non-blocking N-c)', () => {
    writeDoc(
      root,
      'design/tasks/feature.md',
      ['---', 'id: tasks-feature', 'kind: tasks', '---', '', '- [ ] 行形式に一致しないタスク行', ''].join('\n'),
    );
    const result = new AnalyzeModule({ targetRoot: root }).analyze();
    const hit = result.findings.find((f) => f.kind === 'パース失敗');
    assert.ok(hit, result.markdown);
    assert.match(hit?.summary ?? '', /1 件/);
    assert.match(hit?.location ?? '', /design[\\/]tasks[\\/]feature\.md:6/);
  });
});
