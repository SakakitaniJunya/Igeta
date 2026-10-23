// 決定の状態のテストが共有する道具: 一時フォルダの本物の git repo と、ADR の fixture。
// git は本物 (commit・archive・log を実際に走らせる)。GitHub だけが差し込み口 (GitHubPort) の fixture になる。

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const APPROVER = { name: 'CEO', github: 'ceo-gh' } as const;
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
