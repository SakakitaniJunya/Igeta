// node --test dist/core/GitRef.test.js
// 本物の git repo (一時ディレクトリ) で、ref の解決・ファイルの列挙・内容の読み出しを確かめる。
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GitError, listFilesAtRef, mergeBase, readFileAtRef, resolveCommit } from './GitRef.js';

const workspaces: string[] = [];

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-C', root, '-c', 'user.name=igeta-test', '-c', 'user.email=igeta-test@example.com', '-c', 'commit.gpgsign=false', ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

function write(root: string, relPath: string, content: string): void {
  const target = join(root, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

describe('GitRef', () => {
  let root: string;
  let first: string;
  let second: string;
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'igeta-gitref-'));
    workspaces.push(root);
    git(root, 'init', '-q');
    write(root, 'docs/person/design/予約/flows/01-予約.md', '最初の内容\n');
    write(root, 'docs/ai/specs/01-x.md', 'ai\n');
    write(root, 'README.md', 'root\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', '1');
    first = git(root, 'rev-parse', 'HEAD');
    write(root, 'docs/person/design/予約/flows/01-予約.md', '書き換えた内容\n');
    write(root, 'docs/person/design/決済/00-map.md', '新しい文書\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', '2');
    second = git(root, 'rev-parse', 'HEAD');
  });

  it('resolveCommit: ブランチ名・タグ・HEAD~1・SHA をコミットの SHA にする', () => {
    git(root, 'tag', 'base-tag', first);
    assert.equal(resolveCommit(root, 'HEAD'), second);
    assert.equal(resolveCommit(root, 'HEAD~1'), first);
    assert.equal(resolveCommit(root, 'base-tag'), first);
    assert.equal(resolveCommit(root, first), first);
  });

  it('resolveCommit: 存在しない ref・git の repo でない場所・- で始まる値・空は GitError', () => {
    assert.throws(() => resolveCommit(root, 'no-such-ref'), GitError);
    assert.throws(() => resolveCommit(root, '--all'), /git の ref として使えない値/);
    assert.throws(() => resolveCommit(root, ''), GitError);
    const notRepo = mkdtempSync(join(tmpdir(), 'igeta-gitref-none-'));
    workspaces.push(notRepo);
    assert.throws(() => resolveCommit(notRepo, 'HEAD'), GitError);
  });

  it('listFilesAtRef: その時点の、パスの下のファイルを、root からの相対パス (日本語のまま) で返す', () => {
    assert.deepEqual(listFilesAtRef(root, first, 'docs/person'), ['docs/person/design/予約/flows/01-予約.md']);
    assert.deepEqual(listFilesAtRef(root, second, 'docs/person'), [
      'docs/person/design/予約/flows/01-予約.md',
      'docs/person/design/決済/00-map.md',
    ]);
    assert.deepEqual(listFilesAtRef(root, first, 'docs/client'), []);
  });

  it('readFileAtRef: その時点の内容を読む。ファイルが無ければ GitError', () => {
    assert.equal(readFileAtRef(root, first, 'docs/person/design/予約/flows/01-予約.md'), '最初の内容\n');
    assert.equal(readFileAtRef(root, second, 'docs/person/design/予約/flows/01-予約.md'), '書き換えた内容\n');
    assert.throws(() => readFileAtRef(root, first, 'docs/person/design/決済/00-map.md'), GitError);
  });

  it('mergeBase: 2 つの ref の共通の祖先', () => {
    assert.equal(mergeBase(root, 'HEAD', first), first);
    assert.throws(() => mergeBase(root, 'HEAD', 'no-such-ref'), GitError);
    assert.throws(() => mergeBase(root, '-x', 'HEAD'), /git の ref として使えない値/);
  });
});
