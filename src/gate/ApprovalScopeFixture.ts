// approval-scope のテストが共有する fixture (ADR-0008)。一時ディレクトリに本物の git repo を作り、差分を実際に commit して判定させる。
// テストファイルを分けて並列に動かすため (git の呼び出しが多く、1 ファイルでは 20 秒かかる)、共通部分をここに置く。
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { DocGraphCheck } from '../checks/DocGraphCheck.js';
import { IGETA_ROOT } from '../core/Paths.js';
import { judgeApprovalScope } from './ApprovalScope.js';
import type { BaseSpec, ScopeJudgement, ScopeReason, ScopeResult } from './ApprovalScope.js';

// 利用者の git の設定 (署名・hooksPath・diff.renames など) と、この test を動かす環境の GIT_* (hook の中など) に左右されない
for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) delete process.env[name];
Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
});

const workspaces: string[] = [];

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

export function gitIn(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} が失敗した: ${result.stderr}`);
  return result.stdout.trim();
}

export function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  workspaces.push(dir);
  return dir;
}

export class TestRepo {
  readonly root: string;

  private constructor(root: string) {
    this.root = root;
  }

  /** main に files を commit した repo。 */
  static create(files: Readonly<Record<string, string | Buffer>> = {}): TestRepo {
    const repo = new TestRepo(tempDir('igeta-approval-scope-test-'));
    repo.git('init', '-q', '-b', 'main');
    for (const [rel, content] of Object.entries(files)) repo.write(rel, content);
    repo.git('add', '-A');
    repo.git('commit', '-q', '--allow-empty', '-m', 'base');
    return repo;
  }

  git(...args: string[]): string {
    return gitIn(this.root, ...args);
  }

  write(rel: string, content: string | Buffer): void {
    const target = join(this.root, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  remove(rel: string): void {
    rmSync(join(this.root, rel), { force: true });
  }

  move(from: string, to: string): void {
    mkdirSync(dirname(join(this.root, to)), { recursive: true });
    this.git('mv', from, to);
  }

  branch(name = 'feature'): void {
    this.git('checkout', '-q', '-b', name);
  }

  commit(message = 'change'): void {
    this.git('add', '-A');
    this.git('commit', '-q', '-m', message);
  }
}

export const GATE_GLOBS = [
  'templates/**',
  'src/checks/**',
  'src/gate/**',
  'src/core/Role.ts',
  'src/core/IgetaConfig.ts',
  'src/core/LineClassifier.ts',
  'docs/explanation/0[3-9]-*.md',
];

export const PACKAGE_JSON = JSON.stringify(
  {
    name: 'app',
    version: '1.0.0',
    scripts: { build: 'tsc', 'docs:check': 'igeta docs-check' },
    dependencies: { 'left-pad': '1.0.0' },
    devDependencies: { igeta: 'github:SakakitaniJunya/Igeta#v0.4.0', typescript: '^5.9.3' },
  },
  null,
  2,
);

export const packageJsonWith = (overrides: Record<string, unknown>): string => JSON.stringify({ ...JSON.parse(PACKAGE_JSON), ...overrides }, null, 2);

export const PACKAGE_LOCK = (igetaSha = 'a'.repeat(40), typescript = '5.9.3', integrity = 'sha512-igeta'): string =>
  [
    '{',
    '  "name": "app",',
    '  "lockfileVersion": 3,',
    '  "packages": {',
    '    "": {',
    '      "devDependencies": {',
    '        "igeta": "github:SakakitaniJunya/Igeta#v0.4.0",',
    '        "typescript": "^5.9.3"',
    '      }',
    '    },',
    '    "node_modules/igeta": {',
    '      "version": "0.4.0",',
    `      "resolved": "git+ssh://git@github.com/SakakitaniJunya/Igeta.git#${igetaSha}",`,
    `      "integrity": "${integrity}",`,
    '      "dev": true',
    '    },',
    '    "node_modules/typescript": {',
    `      "version": "${typescript}",`,
    `      "resolved": "https://registry.npmjs.org/typescript/-/typescript-${typescript}.tgz",`,
    '      "dev": true',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');

export const YARN_LOCK = (igetaSha = 'a'.repeat(40), typescript = '5.9.3'): string =>
  [
    '# yarn lockfile v1',
    '',
    '"igeta@github:SakakitaniJunya/Igeta#v0.4.0":',
    '  version "0.4.0"',
    `  resolved "https://codeload.github.com/SakakitaniJunya/Igeta/tar.gz/${igetaSha}"`,
    '',
    'typescript@^5.9.3:',
    `  version "${typescript}"`,
    '',
  ].join('\n');

export const PNPM_LOCK = (igetaSha = 'a'.repeat(40), typescript = '5.9.3'): string =>
  [
    "lockfileVersion: '9.0'",
    '',
    'importers:',
    '  .:',
    '    devDependencies:',
    '      igeta:',
    '        specifier: github:SakakitaniJunya/Igeta#v0.4.0',
    `        version: https://codeload.github.com/SakakitaniJunya/Igeta/tar.gz/${igetaSha}`,
    '      typescript:',
    '        specifier: ^5.9.3',
    `        version: ${typescript}`,
    '',
  ].join('\n');

export const BUN_LOCK = (igetaSha = 'a'.repeat(40), typescript = '5.9.3'): string =>
  [
    '{',
    '  "packages": {',
    `    "igeta": ["igeta@github:SakakitaniJunya/Igeta#${igetaSha}", {}, "x"],`,
    `    "typescript": ["typescript@${typescript}", "", {}, "sha512-ts"],`,
    '  }',
    '}',
    '',
  ].join('\n');

/** 新しい構成の repo (person・client・ai の 3 フォルダと、門を決めるファイル・Igeta 自身の humanPaths)。 */
export const BASE: Readonly<Record<string, string | Buffer>> = {
  'docs/person/requirements/01-requirements.md': '# 要件\n',
  'docs/person/decisions/2026/0001-x.md': '# ADR\n',
  'docs/client/delivery/01-chapter.md': '# 章\n',
  'docs/ai/specs/shared/01-spec.md': '# 仕様\n',
  'docs/ai/handbook/how-to/01-howto.md': '# 手順\n',
  'docs/ai/handbook/AGENTS.md': '# 入口に似た名前\n',
  'docs/explanation/01-a.md': '# a\n',
  'docs/explanation/02-b.md': '# b\n',
  'docs/explanation/03-c.md': '# c\n',
  'docs/explanation/09-d.md': '# d\n',
  'docs/explanation/10-e.md': '# e\n',
  'docs/explanation/README.md': '# explanation\n',
  'src/index.ts': 'export {};\n',
  'src/cli/Command.ts': 'export {};\n',
  'src/checks/Check.ts': 'export {};\n',
  'src/gate/Gate.ts': 'export {};\n',
  'src/core/Role.ts': 'export {};\n',
  'src/core/IgetaConfig.ts': 'export {};\n',
  'src/core/LineClassifier.ts': 'export {};\n',
  'src/core/Other.ts': 'export {};\n',
  'templates/docs/a.md': '# t\n',
  'sub/AGENTS.md': '# 入口に似た名前\n',
  'sub/.igeta.json': '{}\n',
  'README.md': '# app\n',
  'AGENTS.md': '# agents\n',
  '.github/CODEOWNERS': 'docs/person/ @owner\n',
  '.github/workflows/ci.yml': 'name: ci\n',
  '.github/ISSUE_TEMPLATE/bug.md': '# bug\n',
  '.github/dependabot.yml': 'version: 2\n',
  '.igeta.json': `${JSON.stringify({ humanPaths: GATE_GLOBS }, null, 2)}\n`,
  'package.json': PACKAGE_JSON,
  'package-lock.json': PACKAGE_LOCK(),
};

export const local = (ref = 'main'): BaseSpec => ({ mode: 'local', ref });

export const without = (...names: string[]): Record<string, string | Buffer> =>
  Object.fromEntries(Object.entries(BASE).filter(([name]) => !names.includes(name)));

/** origin (bare) に main を push した作業用 repo。ここから feature ブランチを切る。 */
export function withOrigin(): { readonly repo: TestRepo; readonly origin: string } {
  const origin = tempDir('igeta-approval-scope-origin-');
  gitIn(origin, 'init', '-q', '--bare', '-b', 'main');
  const repo = TestRepo.create(BASE);
  repo.git('remote', 'add', 'origin', origin);
  repo.git('push', '-q', 'origin', 'main');
  return { repo, origin };
}

export const doc = (id: string, title: string, kind = 'requirements', arc42 = 1): string =>
  ['---', `id: ${id}`, `title: ${title}`, 'type: design', `kind: ${kind}`, `arc42: ${arc42}`, 'status: active', 'owners: [eng]', 'depends_on: []', 'relates_to: []', '---', '', `# ${title}`, '', `> **TL;DR**: ${title}`, ''].join('\n');

/** 作業ツリーの docs/ から索引 (README・dependencies.md) を再生成する。 */
export async function generate(repo: TestRepo): Promise<void> {
  const violations = await new DocGraphCheck({ write: true }).run({ targetRoot: repo.root, igetaRoot: IGETA_ROOT });
  assert.deepEqual(violations, []);
}

export const judge = (repo: TestRepo, base: BaseSpec = local()): Promise<ScopeResult> =>
  judgeApprovalScope({ root: repo.root, igetaRoot: IGETA_ROOT, base });

export async function judged(repo: TestRepo, base: BaseSpec = local()): Promise<ScopeJudgement> {
  const result = await judge(repo, base);
  assert.ok('judgement' in result, JSON.stringify(result));
  return result.judgement;
}

export function cannotCheckMessage(result: ScopeResult): string {
  assert.ok('violation' in result, `検査不能のはずが判定が出た: ${JSON.stringify(result)}`);
  assert.equal(result.violation.severity, 'cannot-check');
  return result.violation.message;
}

export const pathsOf = (reasons: readonly ScopeReason[]): string[] => reasons.map((r) => r.path);

/** BASE に feature ブランチで mutate を加えて commit し、判定を返す。 */
export async function change(mutate: (repo: TestRepo) => void, files: Readonly<Record<string, string | Buffer>> = BASE): Promise<ScopeJudgement> {
  const repo = TestRepo.create(files);
  repo.branch();
  mutate(repo);
  repo.commit();
  return judged(repo);
}

export const append = (repo: TestRepo, rel: string): void => repo.write(rel, `${rel}\n追記\n`);
