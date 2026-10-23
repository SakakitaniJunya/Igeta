// node --test dist/cli/commands/decision/record.supersede.test.js
// decision-supersede と decision-amend (TST-103・104・307)。
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { parseHistory } from '#decision/core';
import { APPROVER, DECISIONS, disposeAllRepos } from '#core/decision/decision.test-support.js';
import { adrText, landAccepted, pullUrl } from '#core/decision/adr.test-support.js';
import { ExitCode } from '#core/ExitCode.js';
import { fixturePort, unavailablePort } from './port.test-support.js';
import { recordDecision } from './record.js';
import { newRepo, request, status, checkClean } from './record.test-support.js';

after(disposeAllRepos);

describe('decision-supersede / decision-amend', () => {
  it('[TST-103] 新が accepted のとき旧が retired/ へ移り、旧に superseded_by、新に supersedes。索引の承認済に「覆す」・置換の表に覆した ADR', async () => {
    const repo = newRepo();
    landAccepted(repo, { number: '0001', slug: 'old' });
    landAccepted(repo, { number: '0002', slug: 'new' });
    const outcome = await recordDecision(request(repo, unavailablePort, { verb: 'supersede', target: '0001', byAdr: '0002', by: undefined, evidence: undefined }));
    assert.equal(outcome.exitCode, ExitCode.Ok, outcome.lines.join('\n'));
    const old = repo.read(`${DECISIONS}/retired/2026/0001-old.md`);
    assert.match(old, /^status: superseded$/m);
    assert.match(old, /^superseded_by: adr-0002-new$/m);
    assert.match(repo.read(`${DECISIONS}/accepted/2026/0002-new.md`), /^supersedes: \[adr-0001-old\]$/m);
    const index = repo.read(`${DECISIONS}/README.md`);
    assert.match(index, /\| \[0002\]\([^)]*\) \| .* \| ✅ 承認済 \|.*\| \[0001\]\(retired\/2026\/0001-old\.md\) \|/);
    assert.match(index, /\| \[0001\]\(retired\/2026\/0001-old\.md\) \| .* \| ↪ 置換 \| 2026-10-22 \| \[0002\]/);
    assert.deepEqual(checkClean(repo), []);
  });

  it('新が proposed なら supersede は拒否', async () => {
    const repo = newRepo();
    landAccepted(repo, { number: '0001', slug: 'old' });
    repo.write(`${DECISIONS}/proposed/0002-new.md`, adrText({ number: '0002', slug: 'new', extra: { awaiting: APPROVER.name } }));
    repo.commit('proposed new');
    const outcome = await recordDecision(request(repo, unavailablePort, { verb: 'supersede', target: '0001', byAdr: '0002' }));
    assert.equal(outcome.exitCode, ExitCode.Violation);
  });

  it('[TST-104][TST-307] 承認後に本文を直し、新しい PR が merge 済みなら amend: 改訂の行・新しい指紋・status: amended。フォルダはそのまま', async () => {
    const repo = newRepo();
    const landed = landAccepted(repo, { number: '0001', slug: 'a' });
    repo.write(landed.path, repo.read(landed.path).replace('決定の本文。', '直した本文。'));
    const sha = repo.commit('本文を直す (#8)');
    const port = fixturePort({ pulls: { 8: { state: 'merged', author: 'ai', mergedBy: APPROVER.github, mergeCommit: sha, mergedAt: '2026-10-20' } }, commits: { 8: [sha] } });
    assert.ok(checkClean(repo).some((m) => m.includes('[DS6]')), 'amend の前は DS6 の違反');
    const outcome = await recordDecision(request(repo, port, { verb: 'amend', target: '0001', evidence: pullUrl(8) }));
    assert.equal(outcome.exitCode, ExitCode.Ok, outcome.lines.join('\n'));
    const text = repo.read(landed.path);
    assert.match(text, /^status: amended$/m);
    const rows = parseHistory(text.split('\n')).rows;
    assert.deepEqual(rows.map((r) => r.event), ['承認', '改訂']);
    assert.notEqual(rows[0]?.fingerprint, rows[1]?.fingerprint);
    assert.deepEqual(checkClean(repo), []);
  });

  it('本文が変わっていない amend は拒否', async () => {
    const repo = newRepo();
    landAccepted(repo, { number: '0001', slug: 'a' });
    const outcome = await recordDecision(request(repo, unavailablePort, { verb: 'amend', target: '0001', evidence: pullUrl(8) }));
    assert.equal(outcome.exitCode, ExitCode.Violation);
    assert.match(outcome.lines.join('\n'), /変わっていない/);
  });
});
