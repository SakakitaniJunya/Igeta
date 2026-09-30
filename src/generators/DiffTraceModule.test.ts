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

  it('複数 FN 行の function-list で、1 つの FN のタスクを触っても他の FN の REQ は「申告漏れ」にならない (code-reviewer 実バグ #1)', () => {
    // makeRoot() の既定ファイル (product/requirements.md 等) を、複数行・複数節を持つ実テンプレに
    // 近い構成に上書きする: 要件定義書は REQ-101/REQ-201 を別々の行で定義し、機能一覧は
    // FN-001 (→REQ-101) と FN-002 (→REQ-201) を別々の行に持つ。
    writeDoc(
      root,
      'product/requirements.md',
      [
        '---', 'id: requirements', 'kind: requirements', '---', '',
        '## 1. 業務要件', '', '| REQ-101 | 予約に関する業務要件 |', '',
        '## 2. 機能要件', '', '| REQ-201 | 通知に関する業務要件 |', '',
      ].join('\n'),
    );
    writeDoc(
      root,
      'design/basic/function-list.md',
      [
        '---', 'id: function-list', 'kind: function-list', '---', '',
        '## 1. 機能一覧', '',
        '| ID | 機能名 | 対応 REQ |', '|---|---|---|',
        '| FN-001 | 予約する | REQ-101 |',
        '| FN-002 | 通知する | REQ-201 |',
        '',
      ].join('\n'),
    );
    writeDoc(
      root,
      'design/tasks/feature.md',
      [
        '---', 'id: tasks-feature', 'kind: tasks', '---', '',
        '- [ ] T001 [P] [FN-001] 予約 API を実装する (src/reservation.ts)',
        '- [ ] T002 [P] [FN-002] 通知バッチを実装する (src/notification.ts)',
        '',
      ].join('\n'),
    );
    // FN-001 のタスク (reservation.ts) だけを変更し、REQ-101 だけを申告する
    const result = new DiffTraceModule({ targetRoot: root }).trace(['src/reservation.ts'], ['requirements/REQ-101']);
    assert.deepEqual(result.impactedReqIds, ['requirements/REQ-101']);
    // FN-002 (別行) の REQ-201 が紛れ込んで「申告漏れ」にならないこと
    assert.deepEqual(result.missingFromDeclaration, [], result.markdown);
    assert.deepEqual(result.declaredButNotTouched, []);
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

  it('修飾は frontmatter id を使う。ファイル名の連番 (stem) では書かない (code-reviewer round 3 C4)', () => {
    writeDoc(root, 'product/02-tenancy.md', ['---', 'id: tenancy', 'kind: requirements', '---', '', '| REQ-114 |', ''].join('\n'));
    writeDoc(
      root,
      'design/basic/function-list.md',
      ['---', 'id: function-list', 'kind: function-list', '---', '', '| FN-002 | REQ-114 |', ''].join('\n'),
    );
    writeDoc(
      root,
      'design/tasks/feature.md',
      ['---', 'id: tasks-feature', 'kind: tasks', '---', '', '- [ ] T002 [P] [FN-002] 実装する (src/tenancy.ts)', ''].join('\n'),
    );
    const result = new DiffTraceModule({ targetRoot: root }).trace(['src/tenancy.ts'], []);
    assert.deepEqual(result.impactedReqIds, ['tenancy/REQ-114']);
  });

  it('cannotCheck (code-reviewer round 3 C3): docs/ が無ければ裏取りできていない', () => {
    rmSync(join(root, 'docs'), { recursive: true, force: true });
    const result = new DiffTraceModule({ targetRoot: root }).trace([], []);
    assert.equal(result.cannotCheck, true, result.markdown);
    assert.match(result.cannotCheckReason ?? '', /docs が無い/);
  });
});
