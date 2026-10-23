// node --test dist/generators/DocsMigrateDecisions.input.test.js
// docs-migrate の決定の段: 根拠の表の入力と、置換・amended の移行 (MG2)。
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseHistory } from '#decision/core';
import { fixturePort, unavailablePort } from '#cli/commands/decision/port.test-support.js';
import { APPROVER, DECISIONS, disposeAllRepos } from '#core/decision/decision.test-support.js';
import { pullUrl } from '#core/decision/adr.test-support.js';
import { ExitCode } from '#core/ExitCode.js';
import { legacyAdr, legacyRepo, run } from './DocsMigrateDecisions.test-support.js';
import { parseEvidenceTable } from './DocsMigrateDecisions.js';

after(disposeAllRepos);

describe('docs-migrate の決定の段: 根拠の表の入力', () => {
  it('使われない行 (id の綴り違い・rejected の ADR) が 1 つでもあれば、何も書かずに拒否 (2) して列挙する', async () => {
    const repo = legacyRepo();
    legacyAdr(repo, '0001', 'acc', 'accepted');
    legacyAdr(repo, '0002', 'rej', 'rejected');
    const sha = repo.commit('旧配置 (#7)');
    const port = fixturePort({ pulls: { 7: { state: 'merged', author: 'ai', mergedBy: APPROVER.github, mergeCommit: sha } }, commits: { 7: [sha] } });
    const rows = [
      { id: 'adr-0001-acc', by: APPROVER.name, evidence: pullUrl(7) },
      { id: 'adr-0001-acd', by: APPROVER.name, evidence: pullUrl(7) },
      { id: 'adr-0002-rej', by: APPROVER.name, evidence: pullUrl(7) },
    ];
    const outcome = await run(repo, port, rows);
    assert.equal(outcome.exitCode, ExitCode.CannotCheck);
    assert.match(outcome.lines.join('\n'), /adr-0001-acd \/ adr-0002-rej/);
    assert.equal(repo.git('status', '--porcelain'), '');
  });

  it('parseEvidenceTable: 配列でない・JSON でない・by か evidence が欠けた行は 1 行の入力エラー', () => {
    assert.deepEqual(parseEvidenceTable('[{"id":"a","by":"b","evidence":"c"}]'), [{ id: 'a', by: 'b', evidence: 'c' }]);
    for (const bad of ['{}', 'not json', '[{"id":"a","by":"b"}]', '[1]', '[{"id":"a","by":"","evidence":"c"}]']) {
      assert.throws(() => parseEvidenceTable(bad), /--decisions-evidence/, bad);
    }
  });
});

describe('docs-migrate の決定の段: 置換と amended', () => {
  it('[MG2] A が B に置換され、B は accepted だが根拠が無い (差戻しで proposed/) 組も、A は retired のまま移行できる (DS8 は 移行前 の A を咎めない)', async () => {
    const repo = legacyRepo();
    legacyAdr(repo, '0001', 'old', 'superseded', { superseded_by: 'adr-0002-new' });
    legacyAdr(repo, '0002', 'new', 'accepted', { supersedes: '[adr-0001-old]' });
    repo.commit('旧配置');
    const outcome = await run(repo, unavailablePort);
    assert.equal(outcome.exitCode, ExitCode.Ok, outcome.lines.join('\n'));
    assert.equal(existsSync(join(repo.root, `${DECISIONS}/retired/2026/0001-old.md`)), true);
    assert.equal(existsSync(join(repo.root, `${DECISIONS}/proposed/0002-new.md`)), true);
  });

  it('旧 amended は accepted に格下げせず、移行前 (未記入→amended) の 1 行で accepted/<年>/ に置く', async () => {
    const repo = legacyRepo();
    legacyAdr(repo, '0001', 'amd', 'amended');
    repo.commit('旧配置');
    const outcome = await run(repo, unavailablePort);
    assert.equal(outcome.exitCode, ExitCode.Ok, outcome.lines.join('\n'));
    const text = repo.read(`${DECISIONS}/accepted/2026/0001-amd.md`);
    assert.match(text, /^status: amended$/m);
    assert.deepEqual(parseHistory(text.split('\n')).rows.map((r) => [r.event, r.before, r.after]), [['移行前', '未記入', 'amended']]);
  });
});
