// node --test dist
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DiffTraceModule } from './DiffTraceModule.js';

const workspaces: string[] = [];

function writeDoc(root: string, rel: string, content: string): void {
  const target = join(root, 'docs', rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-diff-trace-'));
  workspaces.push(root);
  writeDoc(root, 'product/requirements.md', ['---', 'id: requirements', 'kind: requirements', '---', '', '| REQ-101 |', ''].join('\n'));
  writeDoc(
    root,
    'design/basic/function-list.md',
    ['---', 'id: function-list', 'kind: function-list', '---', '', '| FN-001 | REQ-101 |', ''].join('\n'),
  );
  writeDoc(
    root,
    'design/tasks/feature.md',
    ['---', 'id: tasks-feature', 'kind: tasks', '---', '', '- [ ] T001 [P] [FN-001] 実装する (src/feature.ts)', ''].join('\n'),
  );
  return root;
}

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('DiffTraceModule', () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });

  it('正例: 変更ファイル → タスク → FN → REQ を辿り、申告した REQ と一致すれば missingFromDeclaration が空', () => {
    const result = new DiffTraceModule({ targetRoot: root }).trace(['src/feature.ts'], ['requirements/REQ-101']);
    assert.deepEqual(result.impactedReqIds, ['requirements/REQ-101']);
    assert.deepEqual(result.missingFromDeclaration, []);
    assert.deepEqual(result.declaredButNotTouched, []);
    assert.deepEqual(result.untrackedChangedFiles, []);
  });

  it('負例 (a): 申告に無いが影響する REQ は missingFromDeclaration に載る', () => {
    const result = new DiffTraceModule({ targetRoot: root }).trace(['src/feature.ts'], []);
    assert.deepEqual(result.missingFromDeclaration, ['requirements/REQ-101']);
    assert.match(result.markdown, /## \(a\) 申告に無いが影響する REQ[^\n]*\n\n- requirements\/REQ-101/);
  });

  it('負例 (b): 申告したが差分が触れていない REQ は declaredButNotTouched に載る', () => {
    const result = new DiffTraceModule({ targetRoot: root }).trace([], ['requirements/REQ-101']);
    assert.deepEqual(result.declaredButNotTouched, ['requirements/REQ-101']);
  });

  it('負例 (c): 一部だけタスクに一致しない変更ファイルは untrackedChangedFiles に載る (advisory、cannotCheck ではない)', () => {
    const result = new DiffTraceModule({ targetRoot: root }).trace(['src/feature.ts', 'package.json'], []);
    assert.equal(result.cannotCheck, false, result.markdown);
    assert.deepEqual(result.untrackedChangedFiles, ['package.json']);
    assert.deepEqual(result.impactedReqIds, ['requirements/REQ-101']);
  });

  it('REQ が複数ファイルのローカル採番で曖昧なときは素のトークンのまま残す', () => {
    writeDoc(root, 'product/other.md', ['---', 'id: other', 'kind: requirements', '---', '', '| REQ-101 |', ''].join('\n'));
    const result = new DiffTraceModule({ targetRoot: root }).trace(['src/feature.ts'], []);
    assert.deepEqual(result.impactedReqIds, ['REQ-101']);
  });

  it('cannotCheck (main 決定 A2): 変更ファイルが 1 件もタスクに一致しなければ裏取りできていない (exit 2 の根拠)', () => {
    const result = new DiffTraceModule({ targetRoot: root }).trace(['package.json'], []);
    assert.equal(result.cannotCheck, true, result.markdown);
    assert.match(result.cannotCheckReason ?? '', /変更ファイルが 1 件もタスクに一致しなかった/);
    assert.match(result.markdown, /CANNOT-CHECK/);
  });

  it('cannotCheck (main 決定 A2): kind: tasks の文書が 1 本も無ければ裏取りできていない', () => {
    const bare = mkdtempSync(join(tmpdir(), 'igeta-diff-trace-bare-'));
    workspaces.push(bare);
    writeDoc(bare, 'product/requirements.md', ['---', 'id: requirements', 'kind: requirements', '---', '', '| REQ-101 |', ''].join('\n'));
    const result = new DiffTraceModule({ targetRoot: bare }).trace(['src/feature.ts'], []);
    assert.equal(result.cannotCheck, true, result.markdown);
    assert.match(result.cannotCheckReason ?? '', /kind: tasks の文書が無い/);
  });

  it('cannotCheck (code-reviewer round 3 C3): docs/ が無ければ裏取りできていない', () => {
    rmSync(join(root, 'docs'), { recursive: true, force: true });
    const result = new DiffTraceModule({ targetRoot: root }).trace([], []);
    assert.equal(result.cannotCheck, true, result.markdown);
    assert.match(result.cannotCheckReason ?? '', /docs が無い/);
  });
});
