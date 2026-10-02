// node --test dist/core/GitRef.test.js
// テスト仕様 03 (docs/design/test/specs/03-person-form.md) の P8 (宛先と HEAD の枝分かれの点を起点にして、その時点の文書を読む)。
// 本物の git repo (一時ディレクトリ) で確かめる。
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GitError, listFilesAtRef, mergeBase, readFileAtRef } from './GitRef.js';

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

function commit(root: string, relPath: string, content: string): string {
  const target = join(root, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', relPath);
  return git(root, 'rev-parse', 'HEAD');
}

describe('GitRef (P8: 宛先と HEAD の枝分かれの点から文書を読む)', () => {
  let root: string;
  let branchPoint: string;
  let destTip: string;
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'igeta-gitref-'));
    workspaces.push(root);
    git(root, 'init', '-q');
    branchPoint = commit(root, 'docs/person/design/予約/flows/01-予約.md', '枝分かれの時点の内容\n');
    git(root, 'branch', '-M', 'dest');
    git(root, 'checkout', '-q', '-b', 'feature');
    commit(root, 'docs/person/design/予約/flows/01-予約.md', '枝の側で書き換えた内容\n');
    git(root, 'checkout', '-q', 'dest');
    destTip = commit(root, 'docs/person/design/決済/00-map.md', '宛先の側で足した文書\n');
    git(root, 'checkout', '-q', 'feature');
  });

  it('mergeBase: 宛先のブランチ (名前・タグ・SHA) と HEAD の枝分かれの点を返す。宛先が先へ進んでいても、先端ではない', () => {
    git(root, 'tag', 'dest-tag', destTip);
    for (const dest of ['dest', 'dest-tag', destTip]) assert.equal(mergeBase(root, dest, 'HEAD'), branchPoint, dest);
  });

  it('mergeBase: 無い ref・git の repo でない場所・共通の祖先が無い・- で始まる値は GitError (読めないまま比べたことにしない)', () => {
    assert.throws(() => mergeBase(root, 'no-such-ref', 'HEAD'), GitError);
    assert.throws(() => mergeBase(root, '--all', 'HEAD'), /git の ref として使えない値/);
    const notRepo = mkdtempSync(join(tmpdir(), 'igeta-gitref-none-'));
    workspaces.push(notRepo);
    assert.throws(() => mergeBase(notRepo, 'dest', 'HEAD'), GitError);
    git(root, 'checkout', '-q', '--orphan', 'unrelated');
    commit(root, 'other.md', '共通の祖先が無い\n');
    assert.throws(() => mergeBase(root, 'dest', 'HEAD'), GitError);
    git(root, 'checkout', '-q', 'feature');
  });

  it('listFilesAtRef・readFileAtRef: その時点の文書を、root からの相対パス (日本語のまま) で列挙し、内容を読む。無い文書は GitError', () => {
    assert.deepEqual(listFilesAtRef(root, branchPoint, 'docs/person'), ['docs/person/design/予約/flows/01-予約.md']);
    assert.deepEqual(listFilesAtRef(root, destTip, 'docs/person'), [
      'docs/person/design/予約/flows/01-予約.md',
      'docs/person/design/決済/00-map.md',
    ]);
    assert.deepEqual(listFilesAtRef(root, branchPoint, 'docs/client'), []);
    assert.equal(readFileAtRef(root, branchPoint, 'docs/person/design/予約/flows/01-予約.md'), '枝分かれの時点の内容\n');
    assert.throws(() => readFileAtRef(root, branchPoint, 'docs/person/design/決済/00-map.md'), GitError);
  });
});
