// approval-scope が使う git の呼び出し。差分の取り方は ADR-0008 決定 2
// (`git diff --name-status --no-renames <merge-base>`。移動は元の削除と先の追加の 2 行になる)。
//
// 作業ツリーのファイルと index の内容は書き換えない (git diff が index の stat キャッシュを更新することはある。
// 手で git diff を打ったときと同じ)。失敗は GitError にして呼び出し側が検査不能にする
// (git が使えないのに黙って `ai` を返さない)。

import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

export class GitError extends Error {}

export interface Change {
  /** git の状態文字。A (追加) / M (変更) / D (削除) / T (種別の変更) / U (未解決)。 */
  readonly status: string;
  /** repo のルートからの相対パス (`/` 区切り) */
  readonly path: string;
}

interface GitOutput {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

// package-lock.json のような大きなファイルを git show で読むので、既定の 1 MiB では足りない
const MAX_BUFFER = 512 * 1024 * 1024;

export class GitRepo {
  readonly #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  #spawn(args: readonly string[]): GitOutput {
    const result = spawnSync('git', ['-C', this.#root, ...args], {
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    });
    if (result.error !== undefined) throw new GitError(`git を実行できない: ${result.error.message}`);
    if (result.status === null) throw new GitError(`git ${args.join(' ')} が signal ${String(result.signal)} で終わった`);
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  #run(args: readonly string[]): string {
    const result = this.#spawn(args);
    if (result.status !== 0) {
      throw new GitError(`git ${args.join(' ')} が失敗した (終了コード ${result.status}): ${result.stderr.trim()}`);
    }
    return result.stdout;
  }

  /** root が git の作業ツリーの最上位か。monorepo の部分木から呼ぶと repo 直下のパス規則が合わなくなる。 */
  isTopLevel(): boolean {
    const top = this.#run(['rev-parse', '--show-toplevel']).trim();
    return realpathSync(top) === realpathSync(this.#root);
  }

  /** ref が refname として正しいか。環境変数から来た名前を `main~5` のような式として解釈させない。 */
  isValidRefName(refName: string): boolean {
    return this.#spawn(['check-ref-format', refName]).status === 0;
  }

  /** ref (または式) が指すコミット。無ければ null。 */
  commitOf(ref: string): string | null {
    if (ref.startsWith('-')) throw new GitError(`ref が - で始まっている: ${ref}`);
    const result = this.#spawn(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return result.status === 0 ? result.stdout.trim() : null;
  }

  /** a と b の merge-base。共通の祖先が無い (浅い clone など) と null。 */
  mergeBase(a: string, b: string): string | null {
    const result = this.#spawn(['merge-base', a, b]);
    if (result.status === 0) return result.stdout.trim();
    if (result.status === 1 && result.stderr.trim() === '') return null;
    throw new GitError(`git merge-base ${a} ${b} が失敗した (終了コード ${result.status}): ${result.stderr.trim()}`);
  }

  /**
   * base と作業ツリーの差分。追跡しているファイルは git diff、まだ git add していない新しいファイルは
   * git diff に出ないので ls-files で足す (手元で add する前に確かめても `person/` の新規文書を見落とさない)。
   * CI の clean な checkout では後者は空。
   */
  changes(base: string): readonly Change[] {
    const tracked = this.#run([
      'diff',
      '--no-color',
      '--no-renames',
      '--ignore-submodules=none',
      '--name-status',
      '-z',
      base,
      '--',
    ]).split('\0');
    const changes: Change[] = [];
    for (let i = 0; i + 1 < tracked.length; i += 2) {
      const status = tracked[i];
      const path = tracked[i + 1];
      if (status === undefined || path === undefined || status === '' || path === '') {
        throw new GitError(`git diff --name-status -z の出力を読めない: ${JSON.stringify(tracked.slice(i, i + 2))}`);
      }
      changes.push({ status: status.charAt(0), path });
    }
    for (const path of this.#run(['ls-files', '--others', '--exclude-standard', '-z']).split('\0')) {
      if (path !== '') changes.push({ status: 'A', path });
    }
    return changes;
  }

  /** base の時点でのファイルの内容。 */
  showAt(base: string, path: string): string {
    return this.#run(['show', `${base}:${path}`]);
  }
}
