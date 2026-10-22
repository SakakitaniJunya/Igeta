// 決定の状態のテストが共有する道具: 一時フォルダの本物の git repo と、ADR の fixture。
// git は本物 (commit・archive・log を実際に走らせる)。GitHub だけが差し込み口 (GitHubPort) の fixture になる。

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { editFrontmatter } from './folder.js';
import { decisionFingerprint } from './fingerprint.js';
import type { NewHistoryRow } from './history.js';
import { appendHistoryRow } from './history.js';

export const APPROVER = { name: '榊谷 隼也', github: 'ceo-gh' } as const;
export const SLUG = 'acme/widgets';
export const DECISIONS = 'docs/person/decisions';

export interface TestRepo {
  readonly root: string;
  write(rel: string, content: string): void;
  read(rel: string): string;
  git(...args: string[]): string;
  /** 全部を add して commit し、その sha を返す。date (ISO) を渡せば、その日の commit にする */
  commit(message: string, date?: string): string;
  dispose(): void;
}

const created: string[] = [];

/** origin が acme/widgets の一時 repo。.igeta.json に approvers を 1 人置く */
export function makeRepo(options: { readonly approvers?: boolean } = {}): TestRepo {
  const root = mkdtempSync(join(tmpdir(), 'igeta-decision-'));
  created.push(root);
  const git = (...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  git('remote', 'add', 'origin', `https://github.com/${SLUG}.git`);
  const repo: TestRepo = {
    root,
    write(rel, content) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), content);
    },
    read: (rel) => readFileSync(join(root, rel), 'utf8'),
    git,
    commit(message, date) {
      git('add', '-A');
      const env = date === undefined ? process.env : { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
      execFileSync('git', ['-C', root, 'commit', '-q', '-m', message], { env, stdio: 'ignore' });
      return git('rev-parse', 'HEAD').trim();
    },
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
  const decisions = options.approvers === false ? {} : { decisions: { approvers: [APPROVER] } };
  repo.write('.igeta.json', JSON.stringify(decisions));
  repo.write('docs/person/requirements/01-requirements.md', '---\nid: requirements\nkind: requirements\n---\n\n# 要件\n');
  return repo;
}

/** repo を depth 1 で clone した一時 repo (浅い clone)。origin の URL は元の repo と同じ GitHub の名前に戻す */
export function cloneShallow(source: Pick<TestRepo, 'root'>): TestRepo {
  const root = mkdtempSync(join(tmpdir(), 'igeta-decision-shallow-'));
  created.push(root);
  execFileSync('git', ['clone', '-q', '--depth=1', `file://${source.root}`, root], { stdio: 'ignore' });
  const git = (...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('remote', 'set-url', 'origin', `https://github.com/${SLUG}.git`);
  return {
    root,
    git,
    write(rel, content) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), content);
    },
    read: (rel) => readFileSync(join(root, rel), 'utf8'),
    commit(message) {
      git('add', '-A');
      git('commit', '-q', '-m', message);
      return git('rev-parse', 'HEAD').trim();
    },
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function disposeAllRepos(): void {
  for (const root of created.splice(0)) rmSync(root, { recursive: true, force: true });
}

export interface AdrOptions {
  readonly number: string;
  readonly slug: string;
  readonly status?: string;
  readonly body?: string;
  /** frontmatter に足す項目 (awaiting・supersedes など) */
  readonly extra?: Readonly<Record<string, string>>;
  readonly rows?: readonly NewHistoryRow[];
}

export const adrId = (number: string, slug: string): string => `adr-${number}-${slug}`;

/** ADR 1 本の本文。履歴の行を渡せば、履歴の節も付く */
export function adrText(options: AdrOptions): string {
  const base = [
    '---',
    `id: ${adrId(options.number, options.slug)}`,
    `title: ADR-${options.number} ${options.slug} の題名`,
    'type: adr',
    'kind: adr',
    'arc42: 9',
    `status: ${options.status ?? 'proposed'}`,
    'created: 2026-10-01',
    'owners: [eng]',
    'depends_on: []',
    'relates_to: []',
    '---',
    '',
    `# ADR-${options.number}: ${options.slug}`,
    '',
    options.body ?? '決定の本文。',
    '',
  ].join('\n');
  const withExtra = editFrontmatter(base, { ...(options.extra ?? {}) });
  return (options.rows ?? []).reduce((text, row) => appendHistoryRow(text, row), withExtra);
}

/** decisions/README.md (索引の 2 区間つき)。docs-graph が索引を書ける最小の形 */
export const DECISIONS_README = [
  '---',
  'id: decisions-index',
  'title: decisions — 索引',
  'type: index',
  'status: active',
  'owners: [eng]',
  '---',
  '',
  '# decisions',
  '',
  '> このディレクトリの目的: 決定の記録。',
  '',
  '<!-- AUTOGEN:adr-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->',
  '<!-- AUTOGEN:adr-index:end -->',
  '',
  '## 索引',
  '',
  '<!-- AUTOGEN:dir-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->',
  '<!-- AUTOGEN:dir-index:end -->',
  '',
].join('\n');

export const pullUrl = (n: number): string => `https://github.com/${SLUG}/pull/${n}`;

export function approvalRow(args: { readonly commit: string; readonly fingerprint: string; readonly pull?: number; readonly date?: string }): NewHistoryRow {
  return {
    date: args.date ?? '2026-10-05',
    event: '承認',
    before: 'proposed',
    after: 'accepted',
    by: APPROVER.name,
    evidence: pullUrl(args.pull ?? 7),
    commit: args.commit,
    fingerprint: args.fingerprint,
    memo: '',
  };
}

/**
 * 承認済の ADR を、本物の履歴つきで置く: proposed の本文を commit し (これが根拠 commit)、
 * accepted/<年>/ へ移して承認の行と status を書く。戻り値の evidenceCommit が履歴の根拠 commit。
 */
export function landAccepted(repo: TestRepo, options: AdrOptions & { readonly year?: string }): { path: string; evidenceCommit: string; fingerprint: string } {
  const proposedPath = `${DECISIONS}/proposed/${options.number}-${options.slug}.md`;
  const proposed = adrText({ ...options, status: 'proposed', rows: [], extra: { ...(options.extra ?? {}), awaiting: APPROVER.name } });
  repo.write(proposedPath, proposed);
  const evidenceCommit = repo.commit(`ADR-${options.number} を提案 (#7)`);
  const fingerprint = decisionFingerprint(repo.root, proposedPath, proposed);
  const path = `${DECISIONS}/accepted/${options.year ?? '2026'}/${options.number}-${options.slug}.md`;
  repo.git('rm', '-q', proposedPath);
  repo.write(path, adrText({ ...options, status: 'accepted', rows: [approvalRow({ commit: evidenceCommit, fingerprint })] }));
  repo.commit(`ADR-${options.number} を承認として記録`);
  return { path, evidenceCommit, fingerprint };
}
