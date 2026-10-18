// docs-migrate の repo の読み取り (テスト仕様 07 の M2・M3 の S1・S7)。
// 作業ツリーの状態と追跡ファイルは git から、docs/ の中身はディスクから読む。何も書かない。

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseFrontmatter, scalar } from '../core/Frontmatter.js';
import type { Frontmatter } from '../core/Frontmatter.js';
import { matchesGlob } from '../gate/PathGlob.js';
import { listRepoFiles } from '../checks/AgentsEntrypointCheck.js';

/** git を 1 回呼ぶ。失敗は null (呼び出し側が止める理由にする) */
export function gitOrNull(root: string, args: readonly string[]): string | null {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}

/** git の repo の最上位が root か。違えば理由を返す (S1) */
export function gitRepoProblem(root: string): string | null {
  const top = gitOrNull(root, ['rev-parse', '--show-toplevel']);
  if (top === null) return 'git の repo ではない';
  if (realpathSync(top.trim()) !== realpathSync(root)) return 'git の repo の最上位ではない';
  return null;
}

/** 作業ツリーが clean か (未追跡のファイルも含む)。clean でなければ理由を返す (S1) */
export function dirtyProblem(root: string): string | null {
  const status = gitOrNull(root, ['status', '--porcelain', '--untracked-files=all']);
  if (status === null) return 'git status を読めない';
  return status.trim() === '' ? null : '作業ツリーが clean でない (commit か退避をしてから実行する)';
}

/** 追跡されているファイル (root からの相対パス、区切りは `/`)。git が無ければ null */
export function trackedFiles(root: string): string[] | null {
  const out = gitOrNull(root, ['ls-files', '-z']);
  if (out === null) return null;
  return out.split('\0').filter((path) => path !== '');
}

/**
 * dirRel の下のファイルを、root からの相対パス (区切りは `/`) で返す。数え方は listRepoFiles (AgentsEntrypointCheck) と同じ
 * (.git と node_modules だけを辿らない)。承認の持ち主の確かめと、文書の走査で同じファイルの集まりを見る。
 */
export function filesUnder(root: string, dirRel: string): string[] {
  return listRepoFiles(root).filter((path) => path.startsWith(`${dirRel}/`));
}

/** 移行の対象の文書のうち、索引 (README.md と docs/dependencies.md) か。計画・測定・検査が同じ判定を使う */
export function isIndexPath(path: string): boolean {
  return basename(path) === 'README.md' || path === 'docs/dependencies.md';
}

export const isDirPath = (path: string): boolean => existsSync(path) && statSync(path).isDirectory();

/** repo 相対パスが nonDocPaths のどれかに当たるか (matchesGlob の判定と同じ) */
export const nonDocMatcher =
  (globs: readonly string[]) =>
  (repoPath: string): boolean =>
    globs.some((glob) => matchesGlob(repoPath, glob));

/** 本文の text (CRLF を含みうる) を行に分ける */
export const splitLines = (text: string): string[] => text.replace(/\r\n/g, '\n').split('\n');

/** 文書 1 本の読み取り結果 */
export interface RepoDoc {
  /** repo からの相対パス (`docs/...`) */
  readonly path: string;
  readonly text: string;
  readonly lines: readonly string[];
  readonly meta: Frontmatter | null;
  readonly kind: string | null;
  readonly id: string | null;
  /** frontmatter の context (無記入・空なら null) */
  readonly context: string | null;
  /** 本文 (frontmatter の後ろ) の行 */
  readonly bodyLines: readonly string[];
}

export function readRepoDoc(root: string, path: string): RepoDoc {
  const text = readFileSync(join(root, path), 'utf8');
  const lines = splitLines(text);
  const meta = parseFrontmatter(lines);
  const value = (key: string): string | null => {
    if (meta === null) return null;
    const raw = scalar(meta.data, key);
    return raw === undefined || raw === '' ? null : raw;
  };
  return {
    path,
    text,
    lines,
    meta,
    kind: value('kind'),
    id: value('id'),
    context: value('context'),
    bodyLines: meta === null ? lines : lines.slice(meta.bodyStart),
  };
}
