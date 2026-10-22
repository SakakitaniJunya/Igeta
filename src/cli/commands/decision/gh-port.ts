// 本番の GitHubPort: `gh api` を呼ぶ。gh が無い・未認証・見つからないは失敗として返す (黙って縮退しない)。

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Result } from '#decision/core';
import { fail, succeed } from '#decision/core';
import type { GitHubPort, IssueInfo, PullInfo } from './port.js';

const run = promisify(execFile);
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;

async function api(path: string, extra: readonly string[] = []): Promise<Result<string>> {
  try {
    const { stdout } = await run('gh', ['api', ...extra, path], { maxBuffer: MAX_BUFFER_BYTES });
    return succeed(stdout);
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] ?? '' : String(error);
    return fail(`gh api ${path} に失敗した: ${detail}`);
  }
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json => (typeof value === 'object' && value !== null ? (value as Json) : {});
const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);
const loginOf = (value: unknown): string | undefined => text(record(value)['login']);

async function readJson(path: string): Promise<Result<Json>> {
  const body = await api(path);
  if (!body.ok) return body;
  try {
    return succeed(record(JSON.parse(body.value)));
  } catch {
    return fail(`gh api ${path} の出力が JSON ではない`);
  }
}

async function pull(repo: string, number: number): Promise<Result<PullInfo>> {
  const pr = await readJson(`repos/${repo}/pulls/${number}`);
  if (!pr.ok) return pr;
  const issue = await readJson(`repos/${repo}/issues/${number}`);
  if (!issue.ok) return issue;
  const merged = pr.value['merged'] === true;
  return succeed({
    state: merged ? 'merged' : pr.value['state'] === 'open' ? 'open' : 'closed',
    author: loginOf(pr.value['user']) ?? '',
    mergedBy: loginOf(pr.value['merged_by']),
    closedBy: loginOf(issue.value['closed_by']),
    mergeCommit: text(pr.value['merge_commit_sha']),
    mergedAt: text(pr.value['merged_at'])?.slice(0, 10),
    headRepo: text(record(record(pr.value['head'])['repo'])['full_name']),
  });
}

async function pullCommits(repo: string, number: number): Promise<Result<readonly string[]>> {
  const out = await api(`repos/${repo}/pulls/${number}/commits`, ['--paginate', '--jq', '.[].sha']);
  return out.ok ? succeed(out.value.split('\n').filter((sha) => sha !== '')) : out;
}

async function issue(repo: string, number: number): Promise<Result<IssueInfo>> {
  const body = await readJson(`repos/${repo}/issues/${number}`);
  if (!body.ok) return body;
  return succeed({ state: body.value['state'] === 'open' ? 'open' : 'closed', closedBy: loginOf(body.value['closed_by']) });
}

/** `gh api` で読む GitHubPort */
export function createGhPort(): GitHubPort {
  return { pull, pullCommits, issue };
}
