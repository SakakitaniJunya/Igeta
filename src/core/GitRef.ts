// 宛先のブランチと HEAD の枝分かれの点 (merge-base) を求め、その時点の文書の内容を読む。
//
// PersonFormCheck が、廃の行 (テスト仕様 03 の P8) を枝分かれの点と比べるのに使う。git を呼ぶ処理は、ここに 1 か所だけ
// 持つ。ref は、ブランチ名・タグ・コミットのどれでもよい。読めないときは GitError を投げ、呼び出し側が検査不能として
// 扱う (読めないのに「比べて問題なし」にしない)。

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

/**
 * 2 つの ref の merge-base (共通の祖先) のコミットの SHA。ref が無い・git の repo でない・共通の祖先が無い (浅い clone で
 * 履歴が足りない) ときは GitError
 */
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

/** ref の時点で、`root` からの相対パス (pathspec) の下のファイルのうち、本文に text (固定文字列) を含む物。無ければ空 */
export function grepFilesAtRef(root: string, ref: string, pathspec: string, text: string): readonly string[] {
  assertSafeRef(ref);
  try {
    const output = execFileSync('git', ['-C', root, 'grep', '-l', '-z', '-F', '-e', text, ref, '--', pathspec], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output.split('\0').filter((entry) => entry !== '').map((entry) => entry.slice(ref.length + 1)).sort();
  } catch (error) {
    // git grep は 1 件も当たらないと終了コード 1 (出力は空)。それ以外は失敗
    if ((error as { status?: number }).status === 1) return [];
    throw new GitError(`git grep に失敗した: ${error instanceof Error ? error.message.trim() : String(error)}`);
  }
}

/** ref の時点の複数のファイルの内容を、git を 1 回だけ起動して読む (`git cat-file --batch`)。path は `root` からの相対パス */
export function readFilesAtRef(root: string, ref: string, paths: readonly string[]): ReadonlyMap<string, string> {
  assertSafeRef(ref);
  if (paths.length === 0) return new Map();
  let output: Buffer;
  try {
    output = execFileSync('git', ['-C', root, 'cat-file', '--batch'], {
      input: paths.map((path) => `${ref}:./${path}\n`).join(''),
      maxBuffer: 1024 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new GitError(`git cat-file --batch に失敗した: ${error instanceof Error ? error.message.trim() : String(error)}`);
  }
  const contents = new Map<string, string>();
  let offset = 0;
  for (const path of paths) {
    const headerEnd = output.indexOf('\n', offset);
    const header = output.subarray(offset, headerEnd).toString('utf8');
    const size = /^[0-9a-f]+ blob (\d+)$/.exec(header)?.[1];
    if (size === undefined) throw new GitError(`${ref}:${path} を読めない: ${header}`);
    const start = headerEnd + 1;
    contents.set(path, output.subarray(start, start + Number(size)).toString('utf8'));
    offset = start + Number(size) + 1;
  }
  return contents;
}
