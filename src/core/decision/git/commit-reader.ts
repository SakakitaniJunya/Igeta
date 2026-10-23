// commit の時点の ADR を読む (DS5)。commit ごとに docs/ だけを一時フォルダへ取り出して本文指紋を計算する。
// 雛形以外のファイルは、リンク先の実在の確かめ (指紋の正規化) のために、空のファイルとして置く。

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildSourceIndex } from '../../SourceResolver.js';
import { fingerprinter } from '../fingerprint.js';
import type { Result } from '../history.js';
import { fail, succeed } from '../history.js';
import { git, readIsShallow } from './repo.js';

/** commit の時点の ADR の本文指紋。found / missing (commit に無い・HEAD の履歴に無い) / unverifiable (git が辿れない) */
export type CommitLookup =
  | { readonly status: 'found'; readonly fingerprint: string }
  | { readonly status: 'missing' | 'unverifiable'; readonly reason: string };

export interface CommitReader {
  fingerprintAt(commit: string, id: string): CommitLookup;
  /** 浅い clone か (読めなければ true 扱い)。1 回だけ読んだ値 */
  isShallow(): boolean;
  /** 取り出した一時フォルダを消す */
  dispose(): void;
}

const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;

/** HEAD の履歴にある commit か。浅い clone で辿れないときは unverifiable */
function reachability(root: string, commit: string, isShallow: boolean): 'reachable' | 'missing' | 'unverifiable' {
  const known = git(root, ['cat-file', '-e', `${commit}^{commit}`]);
  if (!known.ok) return isShallow ? 'unverifiable' : 'missing';
  return git(root, ['merge-base', '--is-ancestor', commit, 'HEAD']).ok ? 'reachable' : isShallow ? 'unverifiable' : 'missing';
}

/** docs/ を取り出し、それ以外の追跡ファイルは空のファイルを置く */
function extractTree(root: string, commit: string, into: string): Result<string> {
  try {
    const archive = execFileSync('git', ['-C', root, 'archive', '--format=tar', commit, '--', 'docs'], { maxBuffer: MAX_ARCHIVE_BYTES, stdio: ['ignore', 'pipe', 'pipe'] });
    const untar = spawnSync('tar', ['-x', '-C', into], { input: archive });
    if (untar.status !== 0) return fail(`tar で取り出せない: ${String(untar.stderr)}`);
    const listed = git(root, ['ls-tree', '-r', '-z', '--name-only', commit]);
    if (!listed.ok) return listed;
    for (const path of listed.value.split('\0').filter((name) => name !== '' && !name.startsWith('docs/'))) {
      mkdirSync(dirname(join(into, path)), { recursive: true });
      writeFileSync(join(into, path), '');
    }
    return succeed(into);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

/** 本物の git を読む CommitReader。同じ commit は 1 回だけ取り出し、木ごとにリンクの表も 1 回だけ作る */
export function createGitCommitReader(root: string): CommitReader {
  const shallow = readIsShallow(root);
  const isShallow = !shallow.ok || shallow.value;
  const trees = new Map<string, Result<{ readonly dir: string; readonly fingerprint: (relPath: string, text: string) => string }>>();
  const treeAt = (commit: string) => {
    const cached = trees.get(commit);
    if (cached !== undefined) return cached;
    const dir = mkdtempSync(join(tmpdir(), 'igeta-decision-'));
    const extracted = extractTree(root, commit, dir);
    if (!extracted.ok) rmSync(dir, { recursive: true, force: true });
    const made = extracted.ok ? succeed({ dir, fingerprint: fingerprinter(dir) }) : extracted;
    trees.set(commit, made);
    return made;
  };
  return {
    fingerprintAt(commit, id) {
      if (!shallow.ok) return { status: 'unverifiable', reason: shallow.reason };
      const reach = reachability(root, commit, isShallow);
      if (reach !== 'reachable') return { status: reach, reason: `根拠 commit ${commit.slice(0, 12)} を HEAD の履歴から辿れない` };
      const tree = treeAt(commit);
      if (!tree.ok) return { status: 'unverifiable', reason: tree.reason };
      const doc = buildSourceIndex(tree.value.dir, join(tree.value.dir, 'docs'))?.byId.get(id);
      if (doc === undefined) return { status: 'missing', reason: `根拠 commit ${commit.slice(0, 12)} に ${id} が無い` };
      return { status: 'found', fingerprint: tree.value.fingerprint(doc.relPath, readFileSync(doc.file, 'utf8')) };
    },
    isShallow: () => isShallow,
    dispose() {
      for (const tree of trees.values()) if (tree.ok) rmSync(tree.value.dir, { recursive: true, force: true });
    },
  };
}
