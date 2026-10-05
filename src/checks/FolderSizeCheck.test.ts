// node --test dist/checks/FolderSizeCheck.test.js
// 1 フォルダの文書の本数の検査 (ADR-0004 決定 2)。15 本まで通り、16 本目から落ちること、直下だけを数えること、
// 対象外のフォルダを数えないこと、旧い構成では何も出さないことを、複数のまとまりで確かめる。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IGETA_ROOT } from '../core/Paths.js';
import type { Violation } from '../core/Report.js';
import { FolderSizeCheck, MAX_DOCS_PER_FOLDER } from './FolderSizeCheck.js';

const workspaces: string[] = [];

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-foldersize-'));
  workspaces.push(root);
  return root;
}

function write(root: string, relPath: string, content: string): void {
  const target = join(root, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

/** docs/<dir>/ の直下に、文書を count 本置く (本数だけを見る検査なので、中身は frontmatter だけ) */
function fill(root: string, dir: string, count: number): void {
  for (let i = 1; i <= count; i += 1) {
    write(root, `docs/${dir}/${String(i).padStart(2, '0')}-doc.md`, '---\nkind: guide\n---\n# 文書\n');
  }
}

const run = (root: string): readonly Violation[] => new FolderSizeCheck().run({ targetRoot: root, igetaRoot: IGETA_ROOT });

const filesOf = (violations: readonly Violation[]): string[] =>
  violations.map((violation) => (violation.file ?? '').split('\\').join('/'));

describe('FolderSizeCheck: 新しい構成 (v4)', () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
    // 3 つのまとまりのどれも、上限ちょうど以下に収まる正しい構成
    fill(root, 'person/design/reservation/flows', MAX_DOCS_PER_FOLDER);
    fill(root, 'person/design/payment/flows', 10);
    fill(root, 'person/design/shared', 12);
    fill(root, 'ai/specs/reservation/api', MAX_DOCS_PER_FOLDER);
    fill(root, 'ai/specs/payment/tables', 3);
    fill(root, 'ai/handbook/how-to', MAX_DOCS_PER_FOLDER);
    fill(root, 'client/delivery/spec-v1', 4);
  });

  it('上限は 15 本', () => {
    assert.equal(MAX_DOCS_PER_FOLDER, 15);
  });

  it('どのフォルダも 15 本以下なら通る (ちょうど 15 本のフォルダを含む)', () => {
    assert.deepEqual(run(root), []);
  });

  it('16 本目を置いたフォルダだけが落ち、15 本のままの隣のフォルダ・別のまとまりは落ちない', () => {
    write(root, 'docs/person/design/reservation/flows/16-doc.md', '# 16 本目\n');
    const violations = run(root);
    assert.deepEqual(filesOf(violations), ['docs/person/design/reservation/flows']);
    assert.equal(violations[0]?.severity, 'violation');
    assert.match(violations[0]?.message ?? '', /1 フォルダの文書は 15 本まで: 16 本ある/);
  });

  it('複数のフォルダが超えたら、フォルダごとに 1 件ずつ、本数つきで並べる', () => {
    fill(root, 'ai/specs/payment/tables', 21);
    fill(root, 'person/design/shared', 16);
    write(root, 'docs/ai/handbook/how-to/99-extra.md', '# 超過\n');
    const violations = run(root);
    assert.deepEqual(filesOf(violations), [
      'docs/ai/handbook/how-to',
      'docs/ai/specs/payment/tables',
      'docs/person/design/shared',
    ]);
    assert.deepEqual(
      violations.map((violation) => /(\d+) 本ある/.exec(violation.message)?.[1]),
      ['16', '21', '16'],
    );
  });

  it('README.md (各フォルダの索引) と docs/ 直下の dependencies.md は数えない', () => {
    write(root, 'docs/person/design/reservation/flows/README.md', '# 索引\n');
    write(root, 'docs/ai/handbook/how-to/README.md', '# 索引\n');
    write(root, 'docs/dependencies.md', '# 依存\n');
    write(root, 'docs/README.md', '# 索引\n');
    assert.deepEqual(run(root), []);
  });

  it('数えるのは直下だけ。下位フォルダの文書は、親の本数に入らない', () => {
    // 親フォルダは直下 10 本 + 15 本の子フォルダ 2 つ。合計 40 本でも、どのフォルダも 15 本以下
    fill(root, 'person/design/billing', 10);
    fill(root, 'person/design/billing/flows', MAX_DOCS_PER_FOLDER);
    fill(root, 'person/design/billing/screens', MAX_DOCS_PER_FOLDER);
    assert.deepEqual(run(root), []);
  });

  it('日付のある記録 (ADR・提案書) と提出物のフォルダは、何本あっても落ちない', () => {
    fill(root, 'person/decisions/2026', 40);
    fill(root, 'person/decisions/2025', 17);
    fill(root, 'client/proposals/2026', 20);
    fill(root, 'client/delivery/spec-v1', 30);
    fill(root, 'client/delivery/spec-v2', 16);
    assert.deepEqual(run(root), []);
  });

  it('対象外のフォルダの親・年でない名前・さらに下の階層は、対象外にならない', () => {
    fill(root, 'person/decisions', 16);
    fill(root, 'client/delivery', 16);
    fill(root, 'person/decisions/latest', 16);
    fill(root, 'client/proposals/2026/archive', 16);
    assert.deepEqual(filesOf(run(root)), [
      'docs/client/delivery',
      'docs/client/proposals/2026/archive',
      'docs/person/decisions',
      'docs/person/decisions/latest',
    ]);
  });

  it('3 フォルダの外のフォルダ (docs/ 直下を含む) も数える。nonDocPaths でも免除しない (ADR-0003 決定 6)', () => {
    fill(root, 'vendor-specs', 16);
    fill(root, '', 16);
    assert.deepEqual(filesOf(run(root)), ['docs', 'docs/vendor-specs']);
  });

  it('実装タスク・手引きを、まとまりの下位フォルダへ分けて 15 本ずつにすれば通る。shared が 15 本を超えたら落ちたまま', () => {
    const split = makeRoot();
    fill(split, 'ai/specs/tasks/shared', MAX_DOCS_PER_FOLDER);
    fill(split, 'ai/specs/tasks/payment', MAX_DOCS_PER_FOLDER);
    fill(split, 'ai/specs/tasks/reservation', 7);
    assert.deepEqual(run(split), []);
    write(split, 'docs/ai/specs/tasks/shared/16-doc.md', '# 16 本目\n');
    assert.deepEqual(filesOf(run(split)), ['docs/ai/specs/tasks/shared']);
  });

  it('person・ai・client のうち 1 つしか無くても新しい構成として数える', () => {
    const only = makeRoot();
    fill(only, 'ai/handbook/runbooks', 16);
    assert.deepEqual(filesOf(run(only)), ['docs/ai/handbook/runbooks']);
  });

  it('docs/ が無ければ検査不能', () => {
    const violations = run(makeRoot());
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.severity, 'cannot-check');
  });
});

describe('FolderSizeCheck: 旧い構成 (legacy) と docs/common/ だけの構成 (v3)', () => {
  it('旧い構成の repo は、何本あっても何も出さない', () => {
    const root = makeRoot();
    fill(root, 'design/basic', 33);
    fill(root, 'adr', 35);
    fill(root, '', 20);
    assert.deepEqual(run(root), []);
  });

  it('docs/common/ だけがある repo (person・ai・client が無い) も、新しい構成ではないので何も出さない', () => {
    const root = makeRoot();
    fill(root, 'common', 30);
    fill(root, 'design/basic', 33);
    assert.deepEqual(run(root), []);
  });
});
