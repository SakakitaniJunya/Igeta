// node --test dist/cli/commands/decision/record.refused.test.js
// decision-accept の拒否 (終了 1) と検査不能 (終了 2) (TST-303〜306・313・315・322・324・325)。
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseHistory } from '#decision/core';
import { APPROVER, DECISIONS, disposeAllRepos, makeRepo } from '#core/decision/decision.test-support.js';
import { adrText, pullUrl } from '#core/decision/adr.test-support.js';
import type { TestRepo } from '#core/decision/decision.test-support.js';
import { ExitCode } from '#core/ExitCode.js';
import { fixturePort, unavailablePort } from './port.test-support.js';
import type { GitHubPort } from './port.js';
import type { RecordRequest } from './plan.js';
import { recordDecision } from './record.js';
import { OTHER, newRepo, seedProposed, mergedPort, request, status } from './record.test-support.js';

after(disposeAllRepos);

describe('decision-accept: 拒否 (終了 1) と検査不能 (終了 2)', () => {
  async function refused(patch: (repo: TestRepo, sha: string) => Partial<RecordRequest> & { port?: GitHubPort }, expected: ExitCode = ExitCode.Violation): Promise<string> {
    const repo = newRepo();
    const seeded = seedProposed(repo);
    const extra = patch(repo, seeded.sha);
    const outcome = await recordDecision(request(repo, extra.port ?? seeded.port, extra));
    assert.equal(outcome.exitCode, expected, outcome.lines.join('\n'));
    assert.equal(status(repo), '', '作業ツリーは前と同じ');
    assert.equal(existsSync(join(repo.root, seeded.path)), true);
    return outcome.lines.join('\n');
  }

  it('[TST-303] 根拠が blog・PR の /files URL・commit の URL は拒否', async () => {
    for (const evidence of ['https://blog.example/post', `${pullUrl(7)}/files`, 'https://github.com/acme/widgets/commit/abc1234']) {
      await refused(() => ({ evidence }));
    }
  });

  it('[TST-304] 実在する PR だが、その commit にこの ADR が無い (ADR より前の commit) なら拒否', async () => {
    const repo = newRepo();
    repo.write('docs/other.md', '# 他\n');
    const before = repo.commit('他の PR (#5)');
    const seeded = seedProposed(repo);
    const port = fixturePort({ pulls: { 7: { state: 'merged', author: 'ai', mergedBy: APPROVER.github, mergeCommit: before } }, commits: { 7: [before] } });
    const outcome = await recordDecision(request(repo, port));
    assert.equal(outcome.exitCode, ExitCode.Violation, outcome.lines.join('\n'));
    assert.match(outcome.lines.join('\n'), /adr-0003-cache が無い/);
    assert.equal(existsSync(join(repo.root, seeded.path)), true);
  });

  it('[TST-324] 別 repo の PR の URL は拒否', async () => {
    await refused(() => ({ evidence: 'https://github.com/other/repo/pull/7' }));
  });

  it('[TST-325] merge 済みで ADR を含むが、今の本文と指紋が違う commit なら拒否', async () => {
    const message = await refused((repo) => {
      repo.write(`${DECISIONS}/proposed/0003-cache.md`, adrText({ number: '0003', slug: 'cache', body: '承認の後に変えた本文。', extra: { awaiting: APPROVER.name } }));
      repo.commit('本文を変えた');
      return {};
    });
    assert.match(message, /指紋/);
  });

  it('[TST-305] PR が open か、merge せずに close なら拒否', async () => {
    for (const state of ['open', 'closed'] as const) {
      await refused((_repo, sha) => ({ port: fixturePort({ pulls: { 7: { state, author: 'ai', closedBy: APPROVER.github, mergeCommit: sha } }, commits: { 7: [sha] } }) }));
    }
  });

  it('[TST-306] merge した人が approvers に無い・--by が approvers の名前に無い・--by の github と merge した人が別は拒否', async () => {
    await refused((_repo, sha) => ({ port: mergedPort(sha, { mergedBy: 'stranger' }) }));
    await refused(() => ({ by: '知らない人' }));
    const repo = newRepo();
    const { sha, port } = seedProposed(repo);
    repo.write('.igeta.json', JSON.stringify({ decisions: { approvers: [APPROVER, OTHER] } }));
    repo.commit('two approvers');
    const outcome = await recordDecision(request(repo, port, { by: OTHER.name }));
    assert.equal(outcome.exitCode, ExitCode.Violation);
    assert.ok(sha.length > 0);
  });

  it('[TST-313] 作業ツリーが dirty なら拒否 (1)。gh が使えなければ検査不能 (2)。どちらも前と同じ', async () => {
    const dirty = newRepo();
    const seeded = seedProposed(dirty);
    dirty.write('memo.txt', 'x');
    assert.equal((await recordDecision(request(dirty, seeded.port))).exitCode, ExitCode.Violation);
    await refused(() => ({ port: unavailablePort }), ExitCode.CannotCheck);
  });

  it('[TST-315] 却下した ADR に accept は拒否', async () => {
    const repo = newRepo();
    repo.write(`${DECISIONS}/rejected/2026/0003-cache.md`, adrText({ number: '0003', slug: 'cache', status: 'rejected' }));
    const sha = repo.commit('rejected (#7)');
    const outcome = await recordDecision(request(repo, mergedPort(sha)));
    assert.equal(outcome.exitCode, ExitCode.Violation);
    assert.match(outcome.lines.join('\n'), /遷移できない/);
  });

  it('[TST-313] 書き込みの途中で失敗したら、書く前の状態に戻る (索引の区間が無く docs-graph が落ちる)', async () => {
    const repo = makeRepo();
    const { port } = seedProposed(repo);
    repo.write(`${DECISIONS}/README.md`, '---\nid: decisions-index\ntitle: x\ntype: index\nstatus: active\nowners: [eng]\n---\n\n# decisions\n');
    repo.commit('readme without markers');
    const outcome = await recordDecision(request(repo, port));
    assert.equal(outcome.exitCode, ExitCode.Violation);
    assert.match(outcome.lines.join('\n'), /戻した/);
    assert.equal(status(repo), '');
  });

  it('[TST-322] 同じ id の accept を 2 つ同時に流すと、後の 1 本は拒否 (1)。履歴の行は 1 本', async () => {
    const repo = newRepo();
    const { port } = seedProposed(repo);
    const outcomes = await Promise.all([recordDecision(request(repo, port)), recordDecision(request(repo, port))]);
    assert.deepEqual(outcomes.map((o) => o.exitCode).sort(), [ExitCode.Ok, ExitCode.Violation]);
    assert.equal(parseHistory(repo.read(`${DECISIONS}/accepted/2026/0003-cache.md`).split('\n')).rows.length, 1);
  });
});
