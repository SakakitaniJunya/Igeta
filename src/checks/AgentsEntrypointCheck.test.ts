// node --test dist/checks/AgentsEntrypointCheck.test.js
// AI の入口 (repo 直下の AGENTS.md) と、人の承認が要る側の CODEOWNERS の行の検査 (ADR-0002 条件 15、ADR-0008 決定 3)。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IGETA_ROOT } from '../core/Paths.js';
import type { Violation } from '../core/Report.js';
import { AgentsEntrypointCheck } from './AgentsEntrypointCheck.js';

const workspaces: string[] = [];

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function write(root: string, relPath: string, content: string): void {
  const target = join(root, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

const AGENTS_OK = [
  '# AGENTS.md',
  '',
  '- 決まりは `docs/person/` (人が承認する。上流)',
  '- 作り方は `docs/ai/` (あなたの持ち場)',
  '',
].join('\n');

const CODEOWNERS_OK = ['# 人の承認が要る側', 'docs/person/ @creanest/owners', 'docs/client/ @creanest/owners', ''].join('\n');

/** 新しい構成 (docs/person がある) で、AGENTS.md と CODEOWNERS が揃った repo */
function makeValidRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-agents-'));
  workspaces.push(root);
  write(root, 'docs/person/requirements/01-requirements.md', '---\nkind: requirements\n---\n# 要件\n');
  write(root, 'docs/ai/handbook/how-to/01-setup.md', '---\nkind: guide\n---\n# 手順\n');
  write(root, 'AGENTS.md', AGENTS_OK);
  write(root, '.github/CODEOWNERS', CODEOWNERS_OK);
  return root;
}

const run = (root: string): readonly Violation[] => new AgentsEntrypointCheck().run({ targetRoot: root, igetaRoot: IGETA_ROOT });

describe('AgentsEntrypointCheck: AGENTS.md', () => {
  let root: string;
  beforeEach(() => {
    root = makeValidRoot();
  });

  it('AGENTS.md が docs/person/ と docs/ai/ に触れ、CODEOWNERS に 2 行あれば通る', () => {
    assert.deepEqual(run(root), []);
  });

  it('repo 直下に AGENTS.md が無ければ落ちる (docs/ の中に置いても入口にならない)', () => {
    rmSync(join(root, 'AGENTS.md'));
    write(root, 'docs/ai/handbook/how-to/AGENTS.md', AGENTS_OK);
    const violations = run(root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.severity, 'violation');
    assert.equal(violations[0]?.file, 'AGENTS.md');
    assert.match(violations[0]?.message ?? '', /repo 直下に AGENTS\.md が無い/);
  });

  it('AGENTS.md がフォルダなら無いのと同じ', () => {
    rmSync(join(root, 'AGENTS.md'));
    mkdirSync(join(root, 'AGENTS.md'));
    assert.match(run(root)[0]?.message ?? '', /repo 直下に AGENTS\.md が無い/);
  });

  it('docs/person/ に触れていなければ落ち、触れていないのが docs/ai/ ならそちらが落ちる', () => {
    write(root, 'AGENTS.md', '# AGENTS.md\n\n作り方は `docs/ai/` を読む。\n');
    const noPerson = run(root);
    assert.equal(noPerson.length, 1);
    assert.match(noPerson[0]?.message ?? '', /AGENTS\.md が docs\/person\/ に触れていない/);

    write(root, 'AGENTS.md', '# AGENTS.md\n\n決まりは [人の文書](docs/person/design/shared/00-map.md)。\n');
    const noAi = run(root);
    assert.equal(noAi.length, 1);
    assert.match(noAi[0]?.message ?? '', /AGENTS\.md が docs\/ai\/ に触れていない/);
  });

  it('どちらにも触れていなければ 2 件落ちる', () => {
    write(root, 'AGENTS.md', '# AGENTS.md\n\nこの repo のルール。\n');
    assert.equal(run(root).length, 2);
  });

  it('名前の続きだけが似ているもの (docs/personal・docs/aim・mydocs/person) は触れたことにならない', () => {
    write(root, 'AGENTS.md', '# AGENTS.md\n\n`docs/personal/` と `docs/aim/` と `mydocs/person/` を読む。\n');
    assert.equal(run(root).length, 2);
  });

  it('./docs/person や、フォルダの末尾の / が無い書き方・文末の言及も触れたことになる', () => {
    write(root, 'AGENTS.md', 'まず ./docs/person を読む。次に docs/ai\n');
    assert.deepEqual(run(root), []);
  });
});

describe('AgentsEntrypointCheck: .github/CODEOWNERS', () => {
  let root: string;
  beforeEach(() => {
    root = makeValidRoot();
  });

  it('CODEOWNERS が無ければ落ちる', () => {
    rmSync(join(root, '.github'), { recursive: true });
    const violations = run(root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.file, '.github/CODEOWNERS');
    assert.match(violations[0]?.message ?? '', /\.github\/CODEOWNERS が無い/);
  });

  it('docs/client/ の行が無ければ、その 1 件だけ落ちる。docs/person/ の行が無ければその 1 件', () => {
    write(root, '.github/CODEOWNERS', 'docs/person/ @creanest/owners\n');
    const noClient = run(root);
    assert.equal(noClient.length, 1);
    assert.match(noClient[0]?.message ?? '', /docs\/client\/ の行が無い/);

    write(root, '.github/CODEOWNERS', 'docs/client/ @creanest/owners\n');
    const noPerson = run(root);
    assert.equal(noPerson.length, 1);
    assert.match(noPerson[0]?.message ?? '', /docs\/person\/ の行が無い/);

    write(root, '.github/CODEOWNERS', '* @creanest/owners\n');
    assert.equal(run(root).length, 2);
  });

  it('パターンの書き方 (先頭の /・末尾の /・/**・/*・/ 無し) とオーナーの数・CRLF は問わない', () => {
    write(root, '.github/CODEOWNERS', '/docs/person/ @a\r\ndocs/client/** @b @creanest/owners person@example.com\r\n');
    assert.deepEqual(run(root), []);
    write(root, '.github/CODEOWNERS', 'docs/person/* @a\n/docs/client @b\n');
    assert.deepEqual(run(root), []);
  });

  it('オーナーの無い行・コメントになった行・別のフォルダの行は、行とみなさない', () => {
    write(
      root,
      '.github/CODEOWNERS',
      [
        'docs/person/',
        '# docs/client/ @creanest/owners',
        '   # docs/person/ @creanest/owners',
        'docs/client/sub/ @creanest/owners',
        'docs/person/ # オーナーなし',
        'docs/ai/ @creanest/owners',
        '',
      ].join('\n'),
    );
    const violations = run(root);
    assert.equal(violations.length, 2);
    assert.deepEqual(
      violations.map((violation) => /docs\/(person|client)\//.exec(violation.message)?.[1]),
      ['person', 'client'],
    );
  });

  it('AGENTS.md と CODEOWNERS の両方が無ければ、それぞれ 1 件ずつ落ちる', () => {
    rmSync(join(root, 'AGENTS.md'));
    rmSync(join(root, '.github'), { recursive: true });
    assert.equal(run(root).length, 2);
  });
});

describe('AgentsEntrypointCheck: 構成の検出', () => {
  it('person・ai・client のうち 1 つしか無くても新しい構成として検査する', () => {
    const root = mkdtempSync(join(tmpdir(), 'igeta-agents-'));
    workspaces.push(root);
    write(root, 'docs/client/proposals/2026/01-proposal.md', '---\nkind: proposal\n---\n# 提案\n');
    assert.equal(run(root).length, 2);
  });

  it('旧い構成の repo は、AGENTS.md も CODEOWNERS も無くても何も出さない', () => {
    const root = mkdtempSync(join(tmpdir(), 'igeta-agents-'));
    workspaces.push(root);
    write(root, 'docs/product/01-requirements.md', '---\nkind: requirements\n---\n# 要件\n');
    assert.deepEqual(run(root), []);
  });

  it('docs/ が無ければ検査不能', () => {
    const root = mkdtempSync(join(tmpdir(), 'igeta-agents-'));
    workspaces.push(root);
    const violations = run(root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.severity, 'cannot-check');
  });
});
