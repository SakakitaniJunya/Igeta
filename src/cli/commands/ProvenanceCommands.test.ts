// node --test dist/cli/commands/ProvenanceCommands.test.js
// provenance-capture / provenance-accept の CLI が、v3 の指紋を provenance-check と同じ索引で計算することを確かめる。
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExitCode } from '../../core/ExitCode.js';
import { computeFingerprint } from '../../core/Fingerprint.js';
import { buildLinkTable } from '../../core/LinkTable.js';
import { buildSourceIndex } from '../../core/SourceResolver.js';
import {
  ANCHOR_NO_SOURCE, ANCHOR_ROW, CHAPTER, POLICY_DOC, ROW_FROM, TERMS_DOC, chapterDoc, cleanupWorkspaces, makeRoot, readEntries, relocate, reservationDoc, write,
} from '../../generators/rebaseFixture.test-support.js';
import { Cli } from '../Cli.js';
import { ProvenanceAcceptCommand, ProvenanceCaptureCommand, ProvenanceCheckCommand } from './ProvenanceCommands.js';

after(cleanupWorkspaces);

async function run(argv: readonly string[], cwd: string): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const cli = new Cli().register(new ProvenanceCaptureCommand()).register(new ProvenanceAcceptCommand()).register(new ProvenanceCheckCommand());
  const code = await cli.run(argv, { cwd, igetaRoot: cwd, stdout: (line) => out.push(line), stderr: (line) => err.push(line) });
  return { code, out, err };
}

describe('provenance-capture / provenance-accept (CLI、リンクを含む章)', () => {
  it('--no-source でも索引を作る: リンクを含む塊を capture → accept すると、provenance-check が ok (動かしても ok)', async () => {
    const root = makeRoot('igeta-cli-prov-');
    write(root, 'docs/requirements/reservation.md', reservationDoc());
    write(root, 'docs/requirements/policy.md', POLICY_DOC);
    write(root, 'docs/glossary/terms.md', TERMS_DOC);
    write(root, CHAPTER, chapterDoc());

    const captureGreeting = await run(['provenance-capture', CHAPTER, '--anchor', ANCHOR_NO_SOURCE, '--no-source', '--reason', 'ご挨拶', '--by', 'agent:writer', '--root', root], root);
    assert.equal(captureGreeting.code, ExitCode.Ok, captureGreeting.err.join('\n'));
    // capture の時点で、provenance-check が計算し直す値と同じ (--no-source でも索引から文書 id を引いている)
    const captured = readEntries(join(root, CHAPTER))[0];
    assert.ok(captured !== undefined && captured.from === null);
    const rewrite = buildLinkTable(root, buildSourceIndex(root, join(root, 'docs'))).rewriterFor(CHAPTER);
    assert.equal(captured.blockFingerprint, computeFingerprint('\nご挨拶です。[用語集](../../glossary/terms.md) もご覧ください。\n', 3, rewrite));
    const captureRow = await run(['provenance-capture', CHAPTER, '--anchor', ANCHOR_ROW, '--from', ROW_FROM, '--by', 'agent:writer', '--root', root], root);
    assert.equal(captureRow.code, ExitCode.Ok, captureRow.err.join('\n'));
    const acceptAll = await run(['provenance-accept', CHAPTER, '--all', '--by', 'reviewer@example.com', '--root', root], root);
    assert.equal(acceptAll.code, ExitCode.Ok, acceptAll.err.join('\n'));
    assert.deepEqual(readEntries(join(root, CHAPTER)).map((e) => e.normalizationVersion), [3, 3]);

    const check = await run(['provenance-check', '--root', root], root);
    assert.equal(check.code, ExitCode.Ok, check.err.join('\n'));
    assert.deepEqual(check.err, []);

    relocate({ root });
    const moved = await run(['provenance-check', '--root', root], root);
    assert.equal(moved.code, ExitCode.Ok, moved.err.join('\n'));
    assert.deepEqual(moved.err, []);
  });
});
