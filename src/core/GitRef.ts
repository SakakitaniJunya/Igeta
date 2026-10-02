// git の ref (比べる起点) から、文書の内容を読む。
//
// PersonFormCheck (廃の行を起点と比べる) と review-sheet (変わった行を並べる) が使う。git を呼ぶ処理は、ここに
// 1 か所だけ持つ。ref は、利用者が渡すブランチ名・コミット・merge-base のどれでもよい。読めないときは GitError を投げ、
// 呼び出し側が検査不能として扱う (読めないのに「比べて問題なし」にしない)。

import { execFileSync } from 'node:child_process';

export class GitError extends Error {}

function git(root: string, args: readonly string[]): string {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new GitError(`git ${args.join(' ')} に失敗した: ${detail.trim()}`);
  }
}

/** ref が `-` で始まると git がオプションとして読むので、受け付けない */
function assertSafeRef(ref: string): void {
  if (ref === '' || ref.startsWith('-')) throw new GitError(`git の ref として使えない値: "${ref}"`);
}

/** ref をコミットの SHA に解決する。解決できなければ GitError (git の repo でない・ref が無い・浅い clone で履歴が無い) */
export function resolveCommit(root: string, ref: string): string {
  assertSafeRef(ref);
  return git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
}

/** 2 つの ref の merge-base (共通の祖先) のコミット。無ければ GitError */
export function mergeBase(root: string, left: string, right: string): string {
  assertSafeRef(left);
  assertSafeRef(right);
  return git(root, ['merge-base', left, right]).trim();
}

/** ref の時点で、`root` からの相対パス (pathspec) の下にあるファイルを、`root` からの相対パス (区切りは `/`) で返す */
export function listFilesAtRef(root: string, ref: string, pathspec: string): readonly string[] {
  assertSafeRef(ref);
  // -z: パスを NUL で区切る。日本語のファイル名が引用符つきのエスケープ表記にならない
  return git(root, ['ls-tree', '-r', '-z', '--name-only', ref, '--', pathspec])
    .split('\0')
    .filter((path) => path !== '')
    .sort();
}

/** ref の時点のファイルの内容。`root` からの相対パス。ファイルが無ければ GitError (先に listFilesAtRef で確かめる) */
export function readFileAtRef(root: string, ref: string, relPath: string): string {
  assertSafeRef(ref);
  // ref:./path は、`-C root` の cwd からの相対パス (リポジトリの最上位からのパスではない)
  return git(root, ['show', `${ref}:./${relPath}`]);
}
