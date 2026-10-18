// docs-migrate のテストが共有する fixture (テスト本体ではない。`*.test.js` だけが実行される)。
// 一時フォルダに git の repo を作り、実際に `igeta docs-migrate` (DocsMigrateCommand) を走らせて確かめる。
// 持ち主は架空の @lead。案件名・個人情報は無い。

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DocsMigrateCommand } from '../cli/commands/DocsMigrateCommand.js';
import type { CommandContext } from '../cli/Command.js';
import { IGETA_ROOT } from '../core/Paths.js';

const workspaces: string[] = [];

/** `after(cleanupDocsMigrate)` で呼ぶ */
export function cleanupDocsMigrate(): void {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
}

export function writeFiles(root: string, files: Readonly<Record<string, string>>): void {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
}

export function git(root: string, args: readonly string[]): string {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} に失敗: ${result.stderr}`);
  return result.stdout;
}

export function commitAll(root: string): void {
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '--allow-empty', '-m', 'fixture']);
}

/** 一時フォルダに、files を書いて git の repo にして commit する */
export function makeGitRepo(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-docs-migrate-'));
  workspaces.push(root);
  writeFiles(root, files);
  git(root, ['init', '-q']);
  commitAll(root);
  return root;
}

/** repo の中の全ファイルの中身 (.git を除く)。移す・消す前後の比べに使う */
export function snapshot(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else out.set(child, readFileSync(join(root, child), 'utf8'));
    }
  };
  walk('');
  return out;
}

export interface RunResult {
  readonly code: number;
  readonly out: readonly string[];
  readonly err: readonly string[];
}

/** `igeta docs-migrate <args>` を走らせる (カレントディレクトリは root) */
export async function runMigrate(root: string, args: readonly string[]): Promise<RunResult> {
  const out: string[] = [];
  const err: string[] = [];
  const ctx: CommandContext = { cwd: root, igetaRoot: IGETA_ROOT, stdout: (line) => out.push(line), stderr: (line) => err.push(line) };
  const code = await new DocsMigrateCommand().run(args, ctx);
  return { code, out, err };
}

/** frontmatter 付きの文書 */
export function doc(fields: Readonly<Record<string, string | readonly string[]>>, body = '# 見出し\n\n本文。\n'): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    lines.push(typeof value === 'string' ? `${key}: ${value}` : `${key}: [${value.join(', ')}]`);
  }
  lines.push('---', '', body);
  return lines.join('\n');
}

/** 旧い構成 (kind 別のフォルダ) の基本の fixture。全 kind を 1 本ずつ・まとまり・ADR 3 本を含む */
export const OLD_LAYOUT: Readonly<Record<string, string>> = {
  'docs/product/01-requirements.md': doc(
    { id: 'requirements', kind: 'requirements', status: 'draft', depends_on: [] },
    '# 要件\n\n## 1. 業務要件\n\n| ID | 業務要件 | 状態 |\n|---|---|---|\n| REQ-001 | 予約を受ける | 決定 |\n',
  ),
  'docs/product/02-audience-directories.md': doc(
    { id: 'audience-directories', kind: 'requirements', status: 'draft', depends_on: ['requirements'] },
    '# 要件 2\n\n本文。\n',
  ),
  'docs/design/basic/02-solution-strategy.md': doc(
    { id: 'docs-model-strategy', kind: 'solution-strategy', status: 'draft', depends_on: ['requirements'] },
    '# 解決戦略\n\n本文。\n',
  ),
  'docs/00-map.md': doc({ id: 'map', kind: 'map', status: 'active', depends_on: [] }, '# 地図\n\n本文。\n'),
  'docs/design/test/specs/01-approval-gate.md': doc(
    { id: 'test-approval-gate', kind: 'test-spec', context: 'reservation', status: 'draft', depends_on: [] },
    '# テスト 1\n',
  ),
  'docs/design/test/specs/02-other.md': doc({ id: 'test-other', kind: 'test-spec', status: 'draft', depends_on: [] }, '# テスト 2\n'),
  'docs/design/tasks/01-v4-rollout.md': doc({ id: 'tasks-v4-rollout', kind: 'tasks', status: 'draft', depends_on: [] }, '# 作業\n'),
  'docs/explanation/01-a.md': doc({ id: 'explain-a', kind: 'explanation', status: 'active' }, '# 解説 A\n'),
  'docs/design/reservation/00-map.md': doc(
    { id: 'map-reservation', kind: 'context-map', context: 'reservation', status: 'active', depends_on: [] },
    '# 予約の地図\n',
  ),
  'docs/contracts/reservation.md': doc(
    { id: 'contract-reservation', kind: 'context-contract', context: 'reservation', status: 'draft', depends_on: [] },
    '# 予約の約束\n',
  ),
  'docs/adr/0001-a.md': doc({ id: 'adr-0001-a', title: 'ADR 1', type: 'adr', kind: 'adr', status: 'accepted', created: '2025-05-01' }, '# ADR 1\n'),
  'docs/adr/0002-b.md': doc({ id: 'adr-0002-b', title: 'ADR 2', type: 'adr', kind: 'adr', status: 'proposed', created: '2026-01-01' }, '# ADR 2\n'),
  'docs/adr/0003-c.md': doc({ id: 'adr-0003-c', title: 'ADR 3', type: 'adr', kind: 'adr', status: 'proposed', accepted: '2026-02-02' }, '# ADR 3\n'),
  'docs/adr/README.md': '# ADR\n\n> このディレクトリの目的: 決めの記録\n',
  'docs/README.md': [
    '---',
    'id: docs-index',
    'type: index',
    '---',
    '',
    '# docs',
    '',
    '## 読み手別の入口',
    '',
    '- **顧客** (非エンジニア): 提出物の章 (`kind: delivery-chapter` / `delivery/`) を `igeta export` で束ねた PDF だけを読む',
    '- **開発者**: 全体の地図 (`00-map.md`) → まとまりの地図 (`kind: context-map` / `contexts/maps/`) → `igeta review-sheet` で今回の変更のレビューシートを読む',
    '- **AI**: 自分のまとまりの正本と隣のまとまりの約束 (`kind: context-contract` / `contexts/contracts/`) だけを読む。対象の一覧は `igeta context-files` で得る',
    '',
    '## 索引',
    '',
    '<!-- AUTOGEN:dir-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->',
    '<!-- AUTOGEN:dir-index:end -->',
    '',
  ].join('\n'),
  'src/index.ts': 'export const answer = 42;\n',
};

/** 先頭の行の空白を除いた、ファイルの一覧 (ディレクトリを含まない) */
export function filesIn(root: string, rel: string): string[] {
  const abs = join(root, rel);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return [];
  const found: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const child = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(`${dir}/${entry.name}`, child);
      else found.push(child);
    }
  };
  walk(rel, '');
  return found.sort();
}

/** 文書の frontmatter の id を全部 */
export function idsUnder(root: string, rel: string): string[] {
  return filesIn(root, rel)
    .filter((path) => path.endsWith('.md') && !path.endsWith('README.md'))
    .map((path) => /^id:\s*(\S+)/m.exec(readFileSync(join(root, rel, path), 'utf8'))?.[1] ?? '')
    .filter((id) => id !== '')
    .sort();
}
