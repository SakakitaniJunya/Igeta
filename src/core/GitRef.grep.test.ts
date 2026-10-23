// node --test dist/core/GitRef.grep.test.js
// grepFilesAtRef: 利用者の git 設定 (grep.fullName) に出力のパスを左右されない。
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { grepFilesAtRef } from './GitRef.js';

const roots: string[] = [];
after(() => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('grepFilesAtRef', () => {
  it('grep.fullName=true でも、root からの相対パスで返す (repo の最上位の下に root があっても)', () => {
    const top = mkdtempSync(join(tmpdir(), 'igeta-gitgrep-'));
    roots.push(top);
    const git = (...args: string[]): void => void execFileSync('git', ['-C', top, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { stdio: 'ignore' });
    git('init', '-q', '-b', 'main');
    git('config', 'grep.fullName', 'true');
    mkdirSync(join(top, 'sub/docs'), { recursive: true });
    writeFileSync(join(top, 'sub/docs/a.md'), 'trace_columns\n');
    git('add', '-A');
    git('commit', '-qm', 'x');
    assert.deepEqual(grepFilesAtRef(join(top, 'sub'), 'main', 'docs', 'trace_columns'), ['docs/a.md']);
    assert.deepEqual(grepFilesAtRef(join(top, 'sub'), 'main', 'docs', 'nothing-here'), []);
  });
});
