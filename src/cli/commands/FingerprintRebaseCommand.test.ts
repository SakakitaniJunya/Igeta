// node --test dist/cli/commands/FingerprintRebaseCommand.test.js
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExitCode } from '../../core/ExitCode.js';
import { sidecarPathFor } from '../../core/ProvenanceSidecar.js';
import {
  ANCHOR_SECTION, CHAPTER, SUBMISSION, cleanupWorkspaces, makeLegacyRepo, parseLedgerLines, readEntries, readLedgerBytes, reservationDoc, write,
} from '../../generators/rebaseFixture.test-support.js';
import { Cli } from '../Cli.js';
import { FingerprintRebaseCommand } from './FingerprintRebaseCommand.js';

after(cleanupWorkspaces);

async function run(argv: readonly string[], cwd: string): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await new Cli().register(new FingerprintRebaseCommand()).run(['fingerprint-rebase', ...argv], {
    cwd,
    igetaRoot: cwd,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  });
  return { code, out, err };
}

describe('igeta fingerprint-rebase', () => {
  it('v2 で一致したものを載せ替え、REBASED と件数を出して Ok (由来 3 件 + 台帳の対応 3 件)', async () => {
    const repo = makeLegacyRepo();
    const { code, out, err } = await run(['--root', repo.root], repo.root);
    assert.equal(code, ExitCode.Ok, err.join('\n'));
    assert.deepEqual(err, []);
    assert.equal(out.filter((l) => l.startsWith(`REBASED ${CHAPTER} `)).length, 3);
    assert.equal(out.filter((l) => l.startsWith(`REBASED ${SUBMISSION}/agreements.ledger.jsonl `)).length, 3);
    assert.equal(out.at(-1), 'OK fingerprint-rebase: 載せ替え 6 件・触らない 0 件 (docs)');
    assert.equal(readEntries(repo.chapterPath).every((e) => e.normalizationVersion === 3), true);
    assert.equal(parseLedgerLines(readLedgerBytes(repo)).at(-1)?.['event'], 'fingerprint-rebase');
  });

  it('一致しないものは触らず KEEP として出す (stderr)。それでも終了コードは Ok (stale は provenance-check が落とす)', async () => {
    const repo = makeLegacyRepo();
    write(repo.root, 'docs/requirements/reservation.md', reservationDoc({ supplement: '別の本文。' }));
    const before = readEntries(repo.chapterPath)[1];
    const { code, out, err } = await run(['--root', repo.root], repo.root);
    assert.equal(code, ExitCode.Ok);
    assert.ok(err.some((l) => l.startsWith(`KEEP ${CHAPTER} ${ANCHOR_SECTION}: 版 2 で計算した今の本文が保存値と違う`)), err.join('\n'));
    assert.deepEqual(readEntries(repo.chapterPath)[1], before);
    assert.match(out.at(-1) ?? '', /^OK fingerprint-rebase: 載せ替え \d+ 件・触らない [1-9]\d* 件/);
  });

  it('<dir> で探す起点を絞れる。何も無いディレクトリでは何も書かない', async () => {
    const repo = makeLegacyRepo();
    const nothing = await run(['--root', repo.root, 'docs/glossary'], repo.root);
    assert.equal(nothing.code, ExitCode.Ok);
    assert.equal(nothing.out.at(-1), 'OK fingerprint-rebase: 載せ替え 0 件・触らない 0 件 (docs/glossary)');
    assert.equal(readEntries(repo.chapterPath).some((e) => e.normalizationVersion === 3), false);
    const scoped = await run(['--root', repo.root, SUBMISSION], repo.root);
    assert.equal(scoped.code, ExitCode.Ok);
    assert.equal(readEntries(repo.chapterPath).every((e) => e.normalizationVersion === 3), true);
  });

  it('もう一度実行しても何も変わらない (冪等)', async () => {
    const repo = makeLegacyRepo();
    await run(['--root', repo.root], repo.root);
    const sidecarBytes = readFileSync(sidecarPathFor(repo.chapterPath), 'utf8');
    const ledgerBytes = readLedgerBytes(repo);
    const second = await run(['--root', repo.root], repo.root);
    assert.equal(second.code, ExitCode.Ok);
    assert.equal(second.out.at(-1), 'OK fingerprint-rebase: 載せ替え 0 件・触らない 0 件 (docs)');
    assert.equal(readFileSync(sidecarPathFor(repo.chapterPath), 'utf8'), sidecarBytes);
    assert.equal(readLedgerBytes(repo), ledgerBytes);
  });

  it('壊れた sidecar があれば検査不能 (exit 2)。他は載せ替える', async () => {
    const repo = makeLegacyRepo();
    writeFileSync(sidecarPathFor(repo.chapterPath), '{ not json');
    const { code, err } = await run(['--root', repo.root], repo.root);
    assert.equal(code, ExitCode.CannotCheck);
    assert.match(err.join('\n'), /CANNOT-CHECK .*JSON が壊れている/);
  });

  it('存在しない <dir>・位置引数が 2 つ以上・知らない引数は検査不能 (exit 2)', async () => {
    const repo = makeLegacyRepo();
    const missing = await run(['--root', repo.root, 'docs/nope'], repo.root);
    assert.equal(missing.code, ExitCode.CannotCheck);
    assert.match(missing.err.join('\n'), /対象のディレクトリが無い/);
    assert.equal((await run(['--root', repo.root, 'docs', 'docs/glossary'], repo.root)).code, ExitCode.CannotCheck);
    assert.equal((await run(['--root', repo.root, '--bogus'], repo.root)).code, ExitCode.CannotCheck);
  });

  it('--help は使い方を出す (Ok)', async () => {
    const { code, out } = await run(['--help'], process.cwd());
    assert.equal(code, ExitCode.Ok);
    assert.match(out.join('\n'), /igeta fingerprint-rebase \[<dir>\]/);
    assert.match(out.join('\n'), /KEEP/);
  });

  it('--docs で正本の検索対象を変えられる (相対パスは cwd から)', async () => {
    const repo = makeLegacyRepo();
    const { code } = await run(['--root', repo.root, '--docs', 'docs', join('docs', 'delivery')], repo.root);
    assert.equal(code, ExitCode.Ok);
    assert.equal(readEntries(repo.chapterPath).every((e) => e.normalizationVersion === 3), true);
  });
});
