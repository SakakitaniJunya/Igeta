// node --test dist/checks/DocsCheck.test.js
// `igeta docs-check` が、索引と参照の検査 (DocGraphCheck) に新しい構成の検査 3 本を足して走ること。
// 利用 repo の CI の設定を変えずに効くこと (ADR-0005 決定 3)、旧い構成の repo は警告 1 件のほかは何も増えないことを見る。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DocsCheckCommand } from '../cli/commands/checkCommands.js';
import type { ExitCode } from '../core/ExitCode.js';
import { IGETA_ROOT } from '../core/Paths.js';
import type { Violation } from '../core/Report.js';
import { DocGraphCheck } from './DocGraphCheck.js';
import { DocsCheck } from './DocsCheck.js';
import { LEGACY_LAYOUT_MESSAGE } from './RoleBoundaryCheck.js';

const workspaces: string[] = [];

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-docscheck-'));
  workspaces.push(root);
  return root;
}

function write(root: string, relPath: string, content: string): void {
  const target = join(root, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

/** 索引と参照の検査が見る最小の frontmatter。id を持たない文書 (id 無し) は、依存の木には入らない */
function doc(kind: string, extra: readonly string[] = [], id: string | null = null): string {
  return ['---', ...(id === null ? [] : [`id: ${id}`]), `kind: ${kind}`, ...extra, '---', '', '# 文書', ''].join('\n');
}

/** 索引 (README.md・dependencies.md) を書く。DocGraphCheck は、1 回目に dependencies.md を索引より先に書くので 2 回走らせる */
async function writeIndexes(root: string): Promise<void> {
  const graph = new DocGraphCheck({ write: true });
  await graph.run({ targetRoot: root, igetaRoot: IGETA_ROOT });
  await graph.run({ targetRoot: root, igetaRoot: IGETA_ROOT });
}

/** v4 の正しい構成。依存の木の根になれる kind だけで作る (人の型・依存の向きの検査は、この検査の外) */
async function makeV4Root(): Promise<string> {
  const root = makeRoot();
  write(root, 'docs/person/requirements/01-requirements.md', doc('requirements', ['arc42: 1'], 'requirements'));
  write(root, 'docs/person/design/shared/00-map.md', doc('map', [], 'map'));
  write(root, 'docs/ai/handbook/how-to/01-setup.md', doc('guide', [], 'setup'));
  write(root, 'docs/ai/handbook/explanation/01-why.md', doc('explanation', [], 'why'));
  write(root, 'AGENTS.md', '# AGENTS.md\n\n決まりは docs/person/、作り方は docs/ai/ を読む。\n');
  write(root, '.github/CODEOWNERS', 'docs/person/ @owners\ndocs/client/ @owners\n');
  await writeIndexes(root);
  return root;
}

/** 旧い構成。新しい構成なら違反になるもの (docs/ 直下の文書・16 本のフォルダ・AGENTS.md と CODEOWNERS が無い) を含む */
async function makeLegacyRoot(): Promise<string> {
  const root = makeRoot();
  write(root, 'docs/product/01-requirements.md', doc('requirements', ['arc42: 1'], 'requirements'));
  write(root, 'docs/notes.md', doc('guide'));
  for (let i = 1; i <= 16; i += 1) write(root, `docs/guides/${String(i).padStart(2, '0')}-guide.md`, doc('guide'));
  await writeIndexes(root);
  return root;
}

async function runDocsCheck(root: string): Promise<{ violations: readonly Violation[]; warnings: readonly string[] }> {
  const check = new DocsCheck();
  const violations = await check.run({ targetRoot: root, igetaRoot: IGETA_ROOT });
  return { violations, warnings: check.warnings };
}

const filesOf = (violations: readonly Violation[]): string[] =>
  violations.map((violation) => (violation.file ?? '').split('\\').join('/')).sort();

describe('DocsCheck: 新しい構成 (v4)', () => {
  it('正しい構成は、違反も警告も出ない', async () => {
    const result = await runDocsCheck(await makeV4Root());
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.warnings, []);
  });

  it('置き場所・本数・AI の入口の違反が、1 回の検査で全部出る', async () => {
    const root = await makeV4Root();
    write(root, 'docs/stray.md', doc('guide', [], 'stray'));
    for (let i = 1; i <= 15; i += 1) write(root, `docs/person/design/shared/${String(i + 1).padStart(2, '0')}-ops.md`, doc('operations', ['arc42: 7']));
    write(root, 'AGENTS.md', '# AGENTS.md\n\ndocs/person/ だけを書いた入口。\n');
    await writeIndexes(root);
    const result = await runDocsCheck(root);
    assert.deepEqual(filesOf(result.violations), ['AGENTS.md', 'docs/person/design/shared', 'docs/stray.md']);
    assert.ok(result.violations.every((violation) => violation.severity === 'violation'));
    assert.deepEqual(result.warnings, []);
  });

  it('索引と参照の検査の違反も、同じ検査の中で出る (索引が古い)', async () => {
    const root = await makeV4Root();
    write(root, 'docs/ai/handbook/how-to/02-added.md', doc('guide', [], 'added'));
    const result = await runDocsCheck(root);
    assert.deepEqual(filesOf(result.violations), ['docs/README.md', 'docs/ai/handbook/how-to/README.md', 'docs/dependencies.md']);
    assert.ok(result.violations.every((violation) => violation.message.startsWith('[docs-graph]')));
  });
});

describe('DocsCheck: 旧い構成 (legacy)', () => {
  it('警告が 1 件出るだけで、違反は 1 件も増えない', async () => {
    const result = await runDocsCheck(await makeLegacyRoot());
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.warnings, [LEGACY_LAYOUT_MESSAGE]);
  });

  it('索引の検査が出す警告 (未解決の参照) はそのまま通り、移行の警告が後ろに付く', async () => {
    const root = await makeLegacyRoot();
    write(root, 'docs/product/02-notes.md', doc('guide', ['relates_to: [no-such-doc]'], 'notes'));
    await writeIndexes(root);
    const result = await runDocsCheck(root);
    assert.deepEqual(result.violations, []);
    assert.equal(result.warnings.length, 2);
    assert.match(result.warnings[0] ?? '', /\[ref\] notes .*no-such-doc/);
    assert.equal(result.warnings[1], LEGACY_LAYOUT_MESSAGE);
  });

  it('旧い構成の索引の違反は、これまでどおり出る (既存の検査は変わらない)', async () => {
    const root = await makeLegacyRoot();
    write(root, 'docs/product/03-added.md', doc('guide', [], 'added'));
    const result = await runDocsCheck(root);
    assert.deepEqual(filesOf(result.violations), ['docs/README.md', 'docs/dependencies.md', 'docs/product/README.md']);
  });
});

describe('DocsCheck: docs/ が無い repo', () => {
  it('検査不能は 1 件だけ (索引の検査が出す。新しい検査は重ねない)', async () => {
    const result = await runDocsCheck(makeRoot());
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]?.severity, 'cannot-check');
    assert.deepEqual(result.warnings, []);
  });
});

describe('igeta docs-check コマンド (CI が呼ぶ入口)', () => {
  async function runCommand(root: string): Promise<{ code: ExitCode; stdout: string[]; stderr: string[] }> {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await new DocsCheckCommand().run(['--root', root], {
      cwd: root,
      igetaRoot: IGETA_ROOT,
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });
    return { code, stdout, stderr };
  }

  it('旧い構成: 終了コード 0、警告 1 行、OK の行', async () => {
    const { code, stdout, stderr } = await runCommand(await makeLegacyRoot());
    assert.equal(code, 0);
    assert.deepEqual(stdout, ['OK docs-check']);
    assert.deepEqual(stderr, [`WARN ${LEGACY_LAYOUT_MESSAGE}`]);
  });

  it('新しい構成の違反: 終了コード 1、違反の行', async () => {
    const root = await makeV4Root();
    write(root, 'docs/stray.md', doc('guide', [], 'stray'));
    await writeIndexes(root);
    const { code, stdout, stderr } = await runCommand(root);
    assert.equal(code, 1);
    assert.deepEqual(stdout, []);
    assert.equal(stderr.length, 1);
    assert.match(stderr[0] ?? '', /^VIOLATION docs[\\/]stray\.md:1 docs\/ 直下の person・ai・client のどれにも属さない文書/);
  });

  it('新しい構成の正しい構成: 終了コード 0、警告なし', async () => {
    const { code, stdout, stderr } = await runCommand(await makeV4Root());
    assert.equal(code, 0);
    assert.deepEqual(stdout, ['OK docs-check']);
    assert.deepEqual(stderr, []);
  });
});
