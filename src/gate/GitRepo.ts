// approval-scope が使う git の呼び出し。差分の取り方はテスト仕様 01 の R1・R2・R4。
//
// 作業ツリーのファイルと index の内容は書き換えない (git diff が index の stat キャッシュを更新し、
// git merge-tree が object を書くことはある。手で打ったときと同じ)。失敗は GitError にして、呼び出し側が検査不能にする
// (git が使えないのに、黙って `ai` を返さない)。

import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

export class GitError extends Error {}

export interface GitOutput {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * git の呼び出し。テストが差し替えられるよう、実行する関数として渡す (doctor の gh と同じ形)。
 * root は git を実行する作業ツリー (`git -C <root>`)。
 */
export type GitRunner = (root: string, args: readonly string[]) => GitOutput;

// 差分は名前だけ (中身は読まない)。巨大な repo の名前の一覧でも収まる大きさ
const MAX_BUFFER = 64 * 1024 * 1024;

export const spawnGit: GitRunner = (root, args) => {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: MAX_BUFFER });
  if (result.error !== undefined) throw new GitError(`git を実行できない: ${result.error.message}`);
  if (result.status === null) throw new GitError(`git ${args.join(' ')} が signal ${String(result.signal)} で終わった`);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

/** 差分の状態の文字。この 4 つ以外 (未解決 U など) は、パスの判定を誤りうるので受け付けない (R4)。 */
export type ChangeStatus = 'A' | 'M' | 'D' | 'T';

export interface Change {
  readonly status: ChangeStatus;
  /** repo のルートからの相対パス (`/` 区切り) */
  readonly path: string;
}

const isChangeStatus = (status: string): status is ChangeStatus =>
  status === 'A' || status === 'M' || status === 'D' || status === 'T';

/** `git diff --name-status -z` の出力 (状態 NUL パス NUL の繰り返し) を読む。 */
function parseNameStatus(output: string): readonly Change[] {
  const tokens = output.split('\0');
  const changes: Change[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const status = tokens[i];
    const path = tokens[i + 1];
    if (status === '' && i === tokens.length - 1) break; // 末尾の NUL の後ろ
    if (status === undefined || path === undefined || path === '') {
      throw new GitError(`git diff --name-status -z の出力を読めない: ${JSON.stringify(tokens.slice(i, i + 2))}`);
    }
    if (!isChangeStatus(status)) {
      throw new GitError(`差分の状態の文字が想定外: ${JSON.stringify(status)} (${path})。A・M・D・T 以外は判定できない`);
    }
    changes.push({ status, path });
  }
  return changes;
}

const DIFF_OPTIONS = ['--no-color', '--no-renames', '--ignore-submodules=none', '--name-status', '-z'] as const;

export class GitRepo {
  readonly #root: string;
  readonly #run: GitRunner;

  constructor(root: string, run: GitRunner = spawnGit) {
    this.#root = root;
    this.#run = run;
  }

  #spawn(args: readonly string[]): GitOutput {
    return this.#run(this.#root, args);
  }

  #ok(args: readonly string[]): string {
    const result = this.#spawn(args);
    if (result.status !== 0) {
      throw new GitError(`git ${args.join(' ')} が失敗した (終了コード ${result.status}): ${result.stderr.trim()}`);
    }
    return result.stdout;
  }

  /** root が git の作業ツリーの最上位か。部分木から呼ぶと、repo 直下のパスの規則が合わなくなる。 */
  isTopLevel(): boolean {
    const top = this.#ok(['rev-parse', '--show-toplevel']).trim();
    return realpathSync(top) === realpathSync(this.#root);
  }

  /**
   * name がブランチの名前として正しいか。環境変数から来た名前を、`main~5` のような式や、`-` で始まるオプションとして
   * 読ませない (`-` で始まる名前は git のブランチ名にできない)。
   */
  isValidBranchName(name: string): boolean {
    if (name.startsWith('-')) return false;
    return this.#spawn(['check-ref-format', '--branch', name]).status === 0;
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
   * commit のツリーにある paths の名前 (ls-tree。作業ツリーは見ない)。directoriesOnly ならフォルダだけ。
   * 無い名前は結果に出ないので、空配列は「ツリーに無い」と分かった状態。
   */
  lsTree(commit: string, paths: readonly string[], directoriesOnly = false): readonly string[] {
    const out = this.#ok(['ls-tree', '--name-only', '-z', ...(directoriesOnly ? ['-d'] : []), commit, '--', ...paths]);
    return out.split('\0').filter((name) => name !== '');
  }

  /** commit の時点のファイルの内容 (作業ツリーのファイルは開かない)。 */
  showAt(commit: string, path: string): string {
    return this.#ok(['show', `${commit}:${path}`]);
  }

  /**
   * destTip を宛先の先端、HEAD を変更の先端として merge した結果の tree。結果を作るだけで、branch や作業ツリーは変えない。
   * 衝突するとき・git が `merge-tree --write-tree` (2.38 以降) を持たないときは、結果が決まらないので GitError。
   */
  mergeTree(destTip: string): string {
    const result = this.#spawn(['merge-tree', '--write-tree', destTip, 'HEAD']);
    if (result.status === 1) {
      throw new GitError(`宛先の先端 (${destTip.slice(0, 12)}) と HEAD の merge が衝突する。衝突を解いてから確かめる`);
    }
    if (result.status !== 0) {
      throw new GitError(
        `git merge-tree --write-tree が使えない (git 2.38 以降が要る) か、失敗した (終了コード ${result.status}): ${result.stderr.trim()}`,
      );
    }
    const tree = (result.stdout.split('\n')[0] ?? '').trim();
    if (!/^[0-9a-f]{40,64}$/.test(tree)) {
      throw new GitError(`git merge-tree --write-tree の出力から tree を読めない: ${JSON.stringify(result.stdout.slice(0, 80))}`);
    }
    return tree;
  }

  /** from から to (commit か tree) までの差分。移動は削除と追加の 2 行になる。 */
  diff(from: string, to: string): readonly Change[] {
    return parseNameStatus(this.#ok(['diff', ...DIFF_OPTIONS, from, to, '--']));
  }

  /**
   * from から作業ツリーまでの差分。まだ git add していない新しいファイルは git diff に出ないので ls-files で足す
   * (手元で add する前に確かめても、`person/` の新規文書を見落とさない)。`--base` だけが使う。
   */
  diffWorkingTree(from: string): readonly Change[] {
    const changes = [...parseNameStatus(this.#ok(['diff', ...DIFF_OPTIONS, from, '--']))];
    for (const path of this.#ok(['ls-files', '--others', '--exclude-standard', '-z']).split('\0')) {
      if (path !== '') changes.push({ status: 'A', path });
    }
    return changes;
  }
}
