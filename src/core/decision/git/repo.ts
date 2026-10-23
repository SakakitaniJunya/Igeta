// repo の git を読む小さな道具: origin の名前と、ADR が初めて現れた日。git が使えない・浅い clone で辿れないときは失敗を返す。

import { execFileSync } from 'node:child_process';
import type { Result } from '../history.js';
import { fail, succeed } from '../history.js';

const MAX_BUFFER_BYTES = 256 * 1024 * 1024;

/** git を 1 回呼ぶ。失敗は Result で返す */
export function git(root: string, args: readonly string[]): Result<string> {
  try {
    return succeed(execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_BUFFER_BYTES }));
  } catch (error) {
    return fail(error instanceof Error ? error.message.trim() : String(error));
  }
}

/** 浅い clone か。git が読めなければ失敗 */
export function readIsShallow(root: string): Result<boolean> {
  const shallow = git(root, ['rev-parse', '--is-shallow-repository']);
  return shallow.ok ? succeed(shallow.value.trim() === 'true') : shallow;
}

/** `origin` の `owner/repo` */
export function originSlug(root: string): Result<string> {
  const url = git(root, ['remote', 'get-url', 'origin']);
  if (!url.ok) return fail('origin の URL を読めない');
  const matched = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\s*$/.exec(url.value);
  return matched === null ? fail(`origin が GitHub の URL ではない: ${url.value.trim()}`) : succeed(matched[1] ?? '');
}

export interface FirstSeen {
  /** `YYYY-MM-DD` */
  readonly date: string;
  /** 初めて現れた commit の件名 (PR 番号 `(#12)` を含みうる) */
  readonly subject: string;
}

/**
 * ADR のファイル (その path) が初めて追加された commit。名前の変更は辿らない (似た ADR を取り違えないため)。
 * 浅い clone では辿れないので失敗にする (isShallow は呼び出し側が 1 回だけ読んだ値)。
 */
export function firstSeen(root: string, path: string, isShallow: boolean): Result<FirstSeen> {
  if (isShallow) return fail('浅い clone なので、初めて現れた日を辿れない');
  const log = git(root, ['log', '--diff-filter=A', '--format=%cs%x09%s', '--', path]);
  const earliest = log.ok ? log.value.trim().split('\n').at(-1) : undefined;
  const [date = '', subject = ''] = (earliest ?? '').split('\t');
  return date === '' ? fail(`${path} が git の履歴に無い (commit 前)`) : succeed({ date, subject });
}
